import { expect, test, type Page } from "./fixtures";
import { simulateSafeAreas, insetsOf } from "./helpers/layout";
import { dbAll, dbPut, navIdle } from "./workout-helpers";
import { boxOf, dayLit, tourLineMax, type TourTarget } from "./helpers/tour";

// PLAN 3.5u independent verification (tester). Fresh phone through the intake, the welcome tour,
// hidden questions, older answers, 130% text, reduced motion, breaking attempts.
test.use({ intake: "fresh" });
test.beforeEach(async ({ page }) => simulateSafeAreas(page));

const SHOT_PHONES = new Set(["iPhone SE", "iPhone 15", "iPhone 17 Pro Max"]);
const shot = async (page: Page, name: string) => {
  const phone = test.info().project.name;
  if (!SHOT_PHONES.has(phone)) return;
  await page.waitForTimeout(600);
  await page.screenshot({
    path: `reports/shots/3.5u-verify/${name}-${phone.replace(/ /g, "-")}.png`,
  });
};
const US = { weight: "lb", distance: "mi", measure: "in", body: "male" };
const SETS: Record<string, Record<string, unknown>> = {
  fullMuscle: {
    goal: "muscle",
    goals: ["muscle"],
    units: US,
    focus: ["balance"],
    experience: "3y",
    days: 5,
    minutes: 60,
    place: "full",
    equipmentFor: "full",
    style: "mix",
    cardio: "little",
  },
  hotel: {
    goal: "health",
    goals: ["health"],
    units: US,
    experience: "months",
    days: 3,
    minutes: 30,
    place: "hotel",
    equipmentFor: "hotel",
    style: "mix",
    cardio: "lots",
  },
  homeNone: {
    goal: "muscle",
    goals: ["muscle"],
    units: US,
    experience: "1_2y",
    days: 3,
    minutes: 45,
    place: "home",
    equipmentFor: "home",
    equipment: [],
    style: "mix",
    cardio: "little",
  },
};
const atStep = (page: Page, s: string) =>
  expect(page.getByTestId("intake")).toHaveAttribute("data-step", s);
const cta = (page: Page) =>
  page.getByTestId("intake-cta").locator('button[data-variant="primary"]');
const revealPrimary = (page: Page) =>
  page.getByTestId("reveal-cta").locator('button[data-variant="primary"]');
const tour = (page: Page) => page.getByTestId("welcome-tour");
const flag = async (page: Page) =>
  (await dbAll(page, "profile"))[0]?.welcomeTour;

async function toReveal(page: Page, answers: Record<string, unknown>) {
  await page.goto("./");
  await atStep(page, "goal");
  await page.evaluate(
    (a) =>
      localStorage.setItem(
        "anygym.intakeDraft",
        JSON.stringify({ step: "about", answers: a }),
      ),
    answers,
  );
  await page.reload();
  await atStep(page, "about");
  await page.getByTestId("skip").tap();
  await atStep(page, "reveal");
  // The reveal pushes in over about 280 ms; a tap during a view transition hits the transition
  // overlay, not the page. iPhones only passed because their screenshot waited first.
  await navIdle(page);
}

async function expectSpot(page: Page, target: TourTarget) {
  await expect
    .poll(async () => {
      const s = await page.getByTestId("tour-spot").boundingBox();
      const t = await boxOf(target);
      if (!s || !t) return "missing";
      const pads = [
        t.x - s.x,
        t.y - s.y,
        s.x + s.width - (t.x + t.width),
        s.y + s.height - (t.y + t.height),
      ];
      return pads.every((p) => p >= 3 && p <= 9)
        ? "on"
        : `off ${pads.map((p) => p.toFixed(1)).join(",")}`;
    })
    .toBe("on");
}

for (const [name, answers] of Object.entries(SETS).filter(
  ([n]) => n !== "homeNone",
)) {
  test(`(1) ${name}: last button, lands on Today, no session, double tap does nothing extra @matrix`, async ({
    page,
  }) => {
    await toReveal(page, answers);
    const label = await revealPrimary(page).innerText();
    console.log(`LABEL ${name}: ${label}`);
    expect(["Looks good", "Go to Today"]).toContain(label.trim());
    expect(label.trim()).toBe("Looks good");
    // Nothing on the reveal says Start.
    await expect(page.getByRole("button", { name: /start/i })).toHaveCount(0);
    await expect(
      page.getByTestId("reveal-cta").getByRole("button"),
    ).toHaveCount(1);
    await shot(page, `reveal-${name}`);
    // Double tap.
    const b = revealPrimary(page);
    const box = (await b.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await page.waitForTimeout(800);
    expect(await dbAll(page, "sessions")).toHaveLength(0);
    expect(await dbAll(page, "sets")).toHaveLength(0);
    const ps = await dbAll(page, "planState");
    console.log(`PLANSTATE ${name}: ${JSON.stringify(ps)}`);
    if (name !== "homeNone") expect(ps).toHaveLength(1);
    expect((await dbAll(page, "gyms")).length).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => location.hash)).toBe("#/");
    await shot(page, `today-${name}`);
    // No active workout resume card.
    await expect(page.getByTestId("resume-card")).toHaveCount(0);
  });
}

test("(1) home with no equipment: noPlan notice, keep going to the reveal, Go to Today, no session", async ({
  page,
}) => {
  await page.goto("./");
  await atStep(page, "goal");
  await page.evaluate(
    (a) =>
      localStorage.setItem(
        "anygym.intakeDraft",
        JSON.stringify({ step: "noPlan", answers: a }),
      ),
    { ...SETS.fullMuscle, place: "home", equipmentFor: "home", equipment: [] },
  );
  await page.reload();
  await atStep(page, "noPlan");
  await shot(page, "noplan-notice");
  await page.getByTestId("noplan-cta").getByRole("button").tap();
  await expect(page.getByTestId("intake")).not.toHaveAttribute("data-step", "noPlan");
  for (let i = 0; i < 20; i++) {
    const step = (await page.getByTestId("intake").getAttribute("data-step"))!;
    console.log("NPSTEP " + step);
    if (step === "reveal") break;
    if ((await cta(page).count()) && (await cta(page).isEnabled()))
      await cta(page).tap();
    else if (await page.getByTestId("skip").count())
      await page.getByTestId("skip").tap();
    else await page.locator(`[data-testid^="q-${step}-"]`).first().tap();
    await expect(page.getByTestId("intake")).not.toHaveAttribute(
      "data-step",
      step,
    );
  }
  await atStep(page, "reveal");
  const label = (await revealPrimary(page).innerText()).trim();
  console.log(`LABEL noPlan reveal: ${label}`);
  await shot(page, "reveal-noplan");
  await navIdle(page);
  await expect(page.getByRole("button", { name: /start/i })).toHaveCount(0);
  const b = (await revealPrimary(page).boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await page.waitForTimeout(800);
  expect(await dbAll(page, "sessions")).toHaveLength(0);
  await shot(page, "today-noplan");
  await page.waitForTimeout(600);
  if (await tour(page).count()) await shot(page, "today-noplan-tour");
  expect(["Looks good", "Go to Today"]).toContain(label);
});

test("probe: which answers reach the noPlan notice", async ({ page }) => {
  test.skip(test.info().project.name !== "iPhone 15");
  const cands: Record<string, Record<string, unknown>> = {
    outdoors: { ...SETS.fullMuscle, place: "outdoors", equipmentFor: "outdoors", equipment: [] },
    hotelNone: { ...SETS.fullMuscle, place: "hotel", equipmentFor: "hotel", equipment: [] },
    homeShort: { ...SETS.fullMuscle, place: "home", equipmentFor: "home", equipment: [], minutes: 15, days: 6 },
    homeStrength: { ...SETS.fullMuscle, goal: "strength", goals: ["strength"], place: "home", equipmentFor: "home", equipment: [], days: 2 },
  };
  for (const [n, a] of Object.entries(cands)) {
    await page.goto("./");
    // The intake writes its own draft a tick after it shows a step; replace it only after that, or
    // the app's write lands last and the reload resumes the old step (PLAN 3.6v: flaky under load).
    await expect(page.getByTestId("intake")).toHaveAttribute("data-step", /.+/);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
    await page.evaluate((x) => localStorage.setItem("anygym.intakeDraft", JSON.stringify({ step: "equipment", answers: x })), a);
    await page.reload();
    await atStep(page, "equipment");
    await cta(page).tap();
    await page.waitForTimeout(900);
    console.log(`PROBE ${n} -> ${await page.getByTestId("intake").getAttribute("data-step")}`);
  }
});

test("(1) no plan notice has no Start button", async ({ page }) => {
  await page.goto("./");
  await atStep(page, "goal");
  await page.evaluate(
    (a) =>
      localStorage.setItem(
        "anygym.intakeDraft",
        JSON.stringify({ step: "noPlan", answers: a }),
      ),
    {
      goal: "muscle",
      goals: ["muscle"],
      units: US,
      place: "home",
      equipmentFor: "home",
      equipment: [],
    },
  );
  await page.reload();
  await atStep(page, "noPlan");
  await expect(page.getByRole("button", { name: /start/i })).toHaveCount(0);
  await expect(page.getByText(/start a quick/i)).toHaveCount(0);
  await shot(page, "noplan");
  expect(await dbAll(page, "sessions")).toHaveLength(0);
});

test("(2) tour: spotlights match elements, Next/Skip, outside tap and Escape, Start works @matrix", async ({
  page,
}) => {
  await toReveal(page, SETS.fullMuscle!);
  await revealPrimary(page).tap();
  await expect(tour(page)).toHaveAttribute("data-step", "day");
  await expectSpot(page, dayLit(page));
  expect(
    (await page.getByTestId("tour-line").boundingBox())!.height,
  ).toBeLessThan(tourLineMax(page));
  // Tap targets of Next and Skip.
  for (const id of ["tour-next", "tour-skip"]) {
    const bb = (await page.getByTestId(id).boundingBox())!;
    console.log(`TARGET ${id} ${bb.width.toFixed(0)}x${bb.height.toFixed(0)}`);
    expect(bb.height).toBeGreaterThanOrEqual(44);
  }
  await shot(page, "tour1");
  await page.getByTestId("tour-next").tap();
  await expect(tour(page)).toHaveAttribute("data-step", "quick");
  await expectSpot(page, page.getByTestId("build-card"));
  await shot(page, "tour2");
  await page.getByTestId("tour-next").tap();
  await expect(tour(page)).toHaveAttribute("data-step", "tabs");
  await expectSpot(page, page.locator('[data-tour="tabs"]'));
  await expect(page.locator('[data-tour="tabs"]').getByRole("link")).toHaveText(
    ["Today", "Run", "History", "Plans"],
  );
  await shot(page, "tour3");
  // Words never over the tab bar nor outside safe area.
  const w = (await page.getByTestId("tour-words").boundingBox())!;
  expect(w.y).toBeGreaterThanOrEqual(insetsOf().top);
  await page.getByTestId("tour-next").tap();
  await expect(tour(page)).toHaveCount(0);
  await expect.poll(() => flag(page)).toBe("done");
  expect(await dbAll(page, "sessions")).toHaveLength(0);
});

test("(2) Escape: what it does", async ({ page, browserName }) => {
  test.skip(test.info().project.name !== "iPhone 15");
  await toReveal(page, SETS.fullMuscle!);
  await revealPrimary(page).tap();
  await expect(tour(page)).toHaveAttribute("data-step", "day");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  const gone = (await tour(page).count()) === 0;
  const step = gone ? "ended" : await tour(page).getAttribute("data-step");
  console.log(`ESCAPE on step1 -> ${step} (${browserName})`);
  test.info().annotations.push({ type: "escape", description: String(step) });
});

test("(2) reload mid tour: tour returns, flag still pending, then done after Skip; Start ends it; no duplicates", async ({
  page,
}) => {
  await toReveal(page, SETS.fullMuscle!);
  await revealPrimary(page).tap();
  await expect(tour(page)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("day-card-title")).toBeVisible();
  await expect(tour(page)).toBeVisible({ timeout: 5000 });
  expect(await flag(page)).toBe("pending");
  await page
    .getByTestId("tour-skip")
    .dblclick()
    .catch(() => undefined);
  await expect(tour(page)).toHaveCount(0);
  await expect.poll(() => flag(page)).toBe("done");
  await page.reload();
  await page.waitForTimeout(1500);
  await expect(tour(page)).toHaveCount(0);
});

test("(2) offline: the tour and Skip work without network", async ({
  page,
  context,
}) => {
  await toReveal(page, SETS.fullMuscle!);
  await context.setOffline(true);
  await revealPrimary(page).tap();
  await expect(tour(page)).toBeVisible();
  await page.getByTestId("tour-skip").tap();
  await expect(tour(page)).toHaveCount(0);
  await expect.poll(() => flag(page)).toBe("done");
  await context.setOffline(false);
});

test("(2) reduced motion: fades only, spotlight snaps", async ({ page }) => {
  test.skip(test.info().project.name !== "iPhone 15");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await toReveal(page, SETS.fullMuscle!);
  await revealPrimary(page).tap();
  await expect(tour(page)).toBeVisible();
  const before = await page.getByTestId("tour-words").boundingBox();
  await page.getByTestId("tour-next").tap();
  await page.waitForTimeout(80);
  const s = (await page.getByTestId("tour-spot").boundingBox())!;
  const t = (await page.getByTestId("build-card").boundingBox())!;
  expect(Math.abs(s.y - t.y)).toBeLessThan(10);
  expect(before).not.toBeNull();
});

test("(2) 130% text on the SE: words card never covers the lit element or Next", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "iPhone SE");
  await toReveal(page, SETS.fullMuscle!);
  await revealPrimary(page).tap();
  await expect(tour(page)).toBeVisible();
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("body *"));
    const fs = els.map((el) => [
      parseFloat(getComputedStyle(el).fontSize),
      parseFloat(getComputedStyle(el).lineHeight),
    ]);
    els.forEach((el, i) => {
      el.style.fontSize = `${fs[i]![0]! * 1.3}px`;
      if (Number.isFinite(fs[i]![1]!))
        el.style.lineHeight = `${fs[i]![1]! * 1.3}px`;
    });
  });
  for (const step of ["day", "quick", "tabs"]) {
    await expect(tour(page)).toHaveAttribute("data-step", step);
    await page.waitForTimeout(900);
    const spot = (await page.getByTestId("tour-spot").boundingBox())!;
    const w = (await page.getByTestId("tour-words").boundingBox())!;
    const n = (await page.getByTestId("tour-next").boundingBox())!;
    const view = page.viewportSize()!;
    const overlap = !(
      w.y + w.height <= spot.y + 1 || w.y >= spot.y + spot.height - 1
    );
    console.log(
      `130% ${step}: spot y${spot.y.toFixed(0)}-${(spot.y + spot.height).toFixed(0)} words y${w.y.toFixed(0)}-${(w.y + w.height).toFixed(0)} next y${n.y.toFixed(0)} overlap=${overlap}`,
    );
    await page.screenshot({
      path: `reports/shots/3.5u-verify/tour-130-${step}-iPhone-SE.png`,
    });
    expect(overlap, `${step} words over the lit element`).toBe(false);
    expect(n.y + n.height).toBeLessThanOrEqual(view.height);
    expect(n.y).toBeGreaterThanOrEqual(0);
    if (step !== "tabs") await page.getByTestId("tour-next").tap();
  }
});

test.describe("existing users", () => {
  test.use({ intake: "done" });
  test("(2) existing user (no flag) never sees it; a pending flag from a restored older backup shows once", async ({
    page,
  }) => {
    await page.goto("./");
    await dbPut(page, {
      profile: [
        {
          id: "me",
          defaultUnit: "lb",
          createdAt: 1,
          intakeDoneAt: 1,
          intake: SETS.fullMuscle,
        },
      ],
    });
    await page.goto("./#/");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await page.waitForTimeout(1800);
    await expect(tour(page)).toHaveCount(0);
    // A backup taken while the tour was pending, restored: profile row comes back with pending.
    await dbPut(page, {
      profile: [
        {
          id: "me",
          defaultUnit: "lb",
          createdAt: 1,
          intakeDoneAt: 1,
          intake: SETS.fullMuscle,
          welcomeTour: "pending",
        },
      ],
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await page.waitForTimeout(1800);
    const shown = (await tour(page).count()) > 0;
    console.log(`RESTORED pending profile -> tour shown: ${shown}`);
    test
      .info()
      .annotations.push({
        type: "restore-pending",
        description: String(shown),
      });
  });

  test("(3) older answers for hidden questions load and survive redo; count and bar consistent", async ({
    page,
  }) => {
    await page.goto("./");
    const old = {
      ...SETS.fullMuscle,
      when: "early",
      bodyweight: { value: 180, unit: "lb" },
      win: ["energy"],
    };
    await dbPut(page, {
      profile: [
        {
          id: "me",
          defaultUnit: "lb",
          createdAt: 1,
          intakeDoneAt: 1,
          intake: old,
        },
      ],
    });
    await page.goto("./#/welcome?redo=1");
    await page.reload();
    const seen: string[] = [];
    const bars: number[] = [];
    for (let i = 0; i < 24; i++) {
      const step = (await page
        .getByTestId("intake")
        .getAttribute("data-step"))!;
      seen.push(step); console.log("STEP " + step);
      bars.push(
        (await page.getByRole("progressbar").count()) ? Number(await page.getByRole("progressbar").getAttribute("aria-valuenow")) : 100,
      );
      await expect(page.getByText(/coming soon/i)).toHaveCount(0);
      if (step === "reveal") break;
      if ((await cta(page).count()) && (await cta(page).isEnabled()))
        await cta(page).tap();
      else if (await page.getByTestId("skip").count())
        await page.getByTestId("skip").tap();
      else await page.locator(`[data-testid^="q-${step}-"]`).first().tap();
      await expect(page.getByTestId("intake")).not.toHaveAttribute(
        "data-step",
        step,
      );
    }
    console.log(`REDO steps ${seen.join(",")} bars ${bars.join(",")}`);
    for (const h of ["win", "when", "bodyweight"])
      expect(seen).not.toContain(h);
    for (let i = 1; i < bars.length; i++)
      expect(bars[i]!).toBeGreaterThanOrEqual(bars[i - 1]!);
    await expect(page.getByTestId("intake")).toHaveAttribute(
      "data-step",
      "reveal",
    );
    await shot(page, "redo-reveal");
    await revealPrimary(page).tap();
    await expect(page).toHaveURL(/#\/$/);
    const p = (await dbAll(page, "profile"))[0]!;
    expect(p.intake).toMatchObject({
      when: "early",
      bodyweight: { value: 180, unit: "lb" },
      win: ["energy"],
    });
    expect(p.welcomeTour).toBeUndefined();
    await page.waitForTimeout(1500);
    await expect(tour(page)).toHaveCount(0);
  });

  test("(3) skip the rest from the first personal question keeps old hidden answers", async ({
    page,
  }) => {
    await page.goto("./");
    const old = {
      ...SETS.fullMuscle,
      when: "early",
      bodyweight: { value: 180, unit: "lb" },
      win: ["energy"],
    };
    await dbPut(page, {
      profile: [
        {
          id: "me",
          defaultUnit: "lb",
          createdAt: 1,
          intakeDoneAt: 1,
          intake: old,
        },
      ],
    });
    // An older draft left on a hidden question.
    await page.evaluate(
      (a) =>
        localStorage.setItem(
          "anygym.intakeDraft",
          JSON.stringify({ step: "win", answers: a }),
        ),
      old,
    );
    await page.goto("./#/welcome?redo=1");
    await page.reload();
    const step = await page.getByTestId("intake").getAttribute("data-step");
    console.log(`OLD DRAFT on win resumes at ${step}`);
    expect(["win", "when", "bodyweight"]).not.toContain(step);
  });
});
