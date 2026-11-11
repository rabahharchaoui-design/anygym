# 3.5w Motion polish: findings

Sources: G's two iPhone recordings (intake-1, 130 s; intake-2, 55 s; local only, stepped at 2 fps
overall and 30 fps around each change) and the current build recorded with Playwright video on the
iPhone 15 and the SE (`before-*.webm`, `after-*.webm` here; same walk, intake to Today).
The ruler, "What would make this a win?" and "When do you work out?" are no longer asked (3.5u), so
what the recordings show there is not judged.

| # | Where (recording time, or clip) | What was wrong | Fix |
|---|---|---|---|
| 1 | intake-1 0:46, "Where do you usually train?" | Layout shift under the finger: the tap adds a pill to "Your plan so far", the strip wraps to a new line and all five cards shrink and move (the tapped one by about 11 pt) while it pulses. | While the tapped card pulses the options keep their height (`data-hold` on the question, IntakeScreen.tsx); the strip's new line uses the room under it. The next screen measures afresh. |
| 2 | intake-1 1:05, "How do you feel about cardio?" | Jump: picking an answer snaps the four tall cards to compact ones and the "Any you like?" grid appears in the same frame. The only motion rule there was `transition: flex-grow`, a layout property. | The layout still changes at once, the cards glide from where they were on a translate (new shared `src/ui/useFlip.ts`, the page spring, 220 ms); the kinds fade in on opacity. The flex-grow transition is gone. |
| 3 | intake-2 0:24 and before clip 12.4 s, "Your plan" | Double animation: the week's rows cascade in while the page is still sliding in, and the check draws 300 ms later on top. | The rows and the check wait for the page to land (`html[data-nav]` pauses them), then build in: rows 40 ms apart, check done 640 ms after landing (860 ms after the tap). |
| 4 | intake-1 1:28 on, before clip 9.6 s, the love or never cards | Reflow: the card underneath has no info button, so when it comes up the button arrives and the name re-wraps ("Barbell Incline Bench Press" one line, then two). | The card underneath keeps the button's room (ExerciseFace.tsx); the name sits on the same lines before and after. |
| 5 | Every screen change, the progress bar | The fill animated `width` (a layout property) and, during a page slide, was animated twice (its own transition inside the view transition's morph). | Full width fill scaled from the left (`transform: scaleX`); its own transition is off while the page slides. |
| 6 | SE, any screen with the strip (verify-3.3a "(3) the strip fills in", 8 of 10 failing) | `useStripFit` moved the strip inside the ResizeObserver callback of the elements that moving it resizes: a second layout in the same frame and WebKit's "ResizeObserver loop completed with undelivered notifications". | The scroller (whose box the strip never changes) is read at once; the question's parts are read on the next frame, one read per frame; the strip itself is not observed. 10 of 10 on the SE. `useMoreBelow` only observes the scroller and only toggles an opacity: no change needed. |
| 7 | Welcome, step 1 on the iPhone 15 (393 x 659) and step 2 on the SE | The words card sat on the tab bar and covered its labels. | The words stay above the tab bar while another element is lit; when they fit neither over nor under it, the page scrolls just far enough for them to fit under. |
| 8 | Welcome, Escape | Escape ended the welcome. | Escape moves on like a tap outside; on the last step it ends it. Skip is the way out. |

Looked at and left alone:

- Screen push and pop, chip and card selects, the pulse before auto advance, the deck fling and
  spring back: transforms and opacity already, on the shared springs; no dropped streak in either
  recording or clip.
- The welcome's light animates width, height and radius as it glides between elements (three moves,
  once per phone). Moving it to transforms means redrawing the cut out; not done here.
- "Your plan so far", once out of sight on a small phone, stays out of sight for the next strip
  screen too (it is the same element). Older than this item and not a motion fault; noted for a later look.
- Welcome step 1 on a 659 pt tall Safari window with a two line day title: there is no room for the
  whole card, the words and the tab bar at once, so the card rises about 58 pt under the Today
  header. In the Home Screen app (852 pt) nothing scrolls.
