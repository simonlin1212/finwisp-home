"""Disposable calculation process. OS sandbox is applied by compute_service, not Python exec."""
import contextlib
import json
import os
from pathlib import Path
import resource
import sys
import threading
import time

resource.setrlimit(resource.RLIMIT_CPU, (25, 26))
resource.setrlimit(resource.RLIMIT_FSIZE, (8_000_000, 8_000_000))
resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
# Also enforce wall time if the owning MCP process is terminated unexpectedly.
# A sleeping calculation consumes no CPU and otherwise outlives RLIMIT_CPU.
parent = os.getppid()
deadline = time.monotonic() + 35
def supervise():
    while True:
        if os.getppid() != parent or time.monotonic() >= deadline:
            os._exit(124)
        time.sleep(.1)
threading.Thread(target=supervise, daemon=True).start()
# Explicit product interpreter library paths only; -I -S excludes user sites and .pth hooks.
for folder in json.loads(sys.argv[2]):
    sys.path.append(folder)
payload = json.loads(Path(sys.argv[1]).read_text())
namespace = {'__name__': '__main__', 'inputs': payload['inputs'], 'result': None}
with contextlib.redirect_stdout(sys.stderr):
    exec(compile(payload['code'], 'experiment.py', 'exec'), namespace)
if namespace['result'] is None:
    raise ValueError('Assign a JSON-compatible value to result; no result was produced')
print(json.dumps(namespace['result'], ensure_ascii=False, allow_nan=False))
