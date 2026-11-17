"""Records the voice pack's clips as WAV files (PLAN 4.4). Run by scripts/make-voice-pack.mjs with
the Python of the Kokoro install that lives OUTSIDE this repo (~/kokoro). Nothing here ships: the
app gets only the finished audio files. Usage: python voice-synth.py <job.json> <out dir>"""
import json
import os
import sys

import soundfile as sf
from kokoro_onnx import Kokoro


def main() -> None:
    job_path, out_dir = sys.argv[1], sys.argv[2]
    with open(job_path, encoding="utf-8") as f:
        job = json.load(f)
    kokoro = Kokoro(job["model"], job["voices"])
    os.makedirs(out_dir, exist_ok=True)
    for i, clip in enumerate(job["clips"]):
        samples, rate = kokoro.create(clip["text"], voice=job["voice"], speed=clip["speed"], lang=job["lang"])
        sf.write(os.path.join(out_dir, clip["id"] + ".wav"), samples, rate)
        print(f"{i + 1}/{len(job['clips'])} {clip['id']}", flush=True)


if __name__ == "__main__":
    main()
