"""One-command launcher for Composer Portfolio Visualizer.

Starts both the Python backend (FastAPI) and the Next.js frontend.
Usage: python start.py
"""

import os
import sys
import subprocess
import time
import signal

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT, "backend")
FRONTEND_DIR = os.path.join(ROOT, "frontend")

processes = []


def cleanup(*_):
    print("\nShutting down...")
    for p in processes:
        try:
            p.terminate()
        except Exception:
            pass
    sys.exit(0)


signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)


def check_env():
    env_path = os.path.join(ROOT, ".env")
    if not os.path.exists(env_path):
        print("ERROR: .env file not found.")
        print("Copy .env.example to .env and fill in your Composer API credentials.")
        sys.exit(1)


def install_deps():
    """Install dependencies if needed."""
    # Python
    req = os.path.join(BACKEND_DIR, "requirements.txt")
    if os.path.exists(req):
        print("Checking Python dependencies...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", req, "-q"],
            cwd=BACKEND_DIR,
        )

    # Node
    nm = os.path.join(FRONTEND_DIR, "node_modules")
    if not os.path.exists(nm):
        print("Installing frontend dependencies...")
        subprocess.run(["npm", "install"], cwd=FRONTEND_DIR, shell=True)


def main():
    check_env()
    install_deps()

    print("=" * 50)
    print("Composer Portfolio Visualizer")
    print("=" * 50)

    # Start backend
    print("\nStarting backend on http://localhost:8001 ...")
    backend = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"],
        cwd=BACKEND_DIR,
    )
    processes.append(backend)
    time.sleep(2)

    # Start frontend
    print("Starting frontend on http://localhost:3000 ...")
    frontend = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=FRONTEND_DIR,
        shell=True,
    )
    processes.append(frontend)

    print("\n  Backend:  http://localhost:8001/api/health")
    print("  Frontend: http://localhost:3000")
    print("  API docs: http://localhost:8001/docs")
    print("\nPress Ctrl+C to stop.\n")

    # Wait for either to exit
    try:
        while True:
            time.sleep(1)
            if backend.poll() is not None:
                print("Backend exited unexpectedly")
                break
            if frontend.poll() is not None:
                print("Frontend exited unexpectedly")
                break
    except KeyboardInterrupt:
        pass
    finally:
        cleanup()


if __name__ == "__main__":
    main()
