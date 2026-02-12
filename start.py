"""One-command launcher for Composer Portfolio Visualizer.

Starts both the Python backend (FastAPI) and the Next.js frontend.
Usage: python start.py
       (or double-click start.bat on Windows)
"""

import os
import sys
import shutil
import subprocess
import time
import signal
import webbrowser
import threading
import urllib.request

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


# ------------------------------------------------------------------
# Prerequisite checks
# ------------------------------------------------------------------

def check_python():
    """Verify Python version is 3.10+."""
    major, minor = sys.version_info[:2]
    if major < 3 or (major == 3 and minor < 10):
        print(f"ERROR: Python 3.10+ is required (you have {major}.{minor}).")
        print("Download the latest version from: https://www.python.org/downloads/")
        sys.exit(1)
    print(f"  Python {major}.{minor} ............. OK")


def check_node():
    """Verify Node.js is installed and is version 18+."""
    npm_cmd = shutil.which("npm")
    if not npm_cmd:
        print("ERROR: Node.js is not installed (npm not found).")
        print("Download it from: https://nodejs.org/")
        print("  Recommended: LTS version (18 or newer)")
        sys.exit(1)

    try:
        result = subprocess.run(
            ["node", "--version"], capture_output=True, text=True, shell=True
        )
        version_str = result.stdout.strip().lstrip("v")
        node_major = int(version_str.split(".")[0])
        if node_major < 18:
            print(f"ERROR: Node.js 18+ is required (you have {version_str}).")
            print("Download the latest LTS from: https://nodejs.org/")
            sys.exit(1)
        print(f"  Node.js {version_str} ......... OK")
    except Exception:
        print("WARNING: Could not determine Node.js version. Continuing anyway...")


def check_accounts():
    """Verify accounts.json exists."""
    accounts_path = os.path.join(ROOT, "accounts.json")
    if not os.path.exists(accounts_path):
        print("\nERROR: accounts.json not found.\n")
        print("  1. Copy accounts.json.example to accounts.json")
        print("  2. Edit accounts.json and add your Composer API credentials")
        print("  3. Run this script again\n")
        print("Your API credentials never leave your machine. See README.md for details.")
        sys.exit(1)
    print("  accounts.json ......... OK")


def check_env():
    """Check for optional .env file."""
    env_path = os.path.join(ROOT, ".env")
    if not os.path.exists(env_path):
        print("  .env .................. not found (using defaults)")
    else:
        print("  .env .................. OK")


def check_prerequisites():
    """Run all prerequisite checks."""
    print("Checking prerequisites...\n")
    check_python()
    check_node()
    check_accounts()
    check_env()
    print()


# ------------------------------------------------------------------
# Dependency installation
# ------------------------------------------------------------------

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
        print("Installing frontend dependencies (first run only, may take a minute)...")
        subprocess.run(["npm", "install"], cwd=FRONTEND_DIR, shell=True)


# ------------------------------------------------------------------
# Browser auto-open
# ------------------------------------------------------------------

def open_browser_when_ready(url, timeout=30):
    """Wait for the frontend to be reachable, then open the browser."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            urllib.request.urlopen(url, timeout=2)
            webbrowser.open(url)
            return
        except Exception:
            time.sleep(1)


# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------

def main():
    check_prerequisites()
    install_deps()

    print("=" * 50)
    print("  Composer Portfolio Visualizer")
    print("=" * 50)

    # Start backend
    print("\nStarting backend...")
    backend = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"],
        cwd=BACKEND_DIR,
    )
    processes.append(backend)

    # Wait for backend to be ready (account discovery can take a while)
    print("  Waiting for backend to be ready", end="", flush=True)
    ready = False
    for _ in range(60):
        if backend.poll() is not None:
            print("\nERROR: Backend failed to start. Check the output above for errors.")
            sys.exit(1)
        try:
            urllib.request.urlopen("http://localhost:8000/api/health", timeout=2)
            ready = True
            break
        except Exception:
            print(".", end="", flush=True)
            time.sleep(1)
    if not ready:
        print("\nERROR: Backend did not become ready within 60 seconds.")
        sys.exit(1)
    print(" ready!")

    # Start frontend
    print("Starting frontend...")
    frontend = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=FRONTEND_DIR,
        shell=True,
    )
    processes.append(frontend)

    # Auto-open browser in background thread
    threading.Thread(
        target=open_browser_when_ready,
        args=("http://localhost:3000",),
        daemon=True,
    ).start()

    print("\n  Dashboard:  http://localhost:3000")
    print("  API docs:   http://localhost:8000/docs")
    print("\n  Opening browser automatically...")
    print("  Press Ctrl+C to stop.\n")

    # Wait for either to exit
    try:
        while True:
            time.sleep(1)
            if backend.poll() is not None:
                print("Backend exited unexpectedly. Check the output above for errors.")
                break
            if frontend.poll() is not None:
                print("Frontend exited unexpectedly. Check the output above for errors.")
                break
    except KeyboardInterrupt:
        pass
    finally:
        cleanup()


if __name__ == "__main__":
    main()
