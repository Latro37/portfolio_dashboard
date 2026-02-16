"""One-command launcher for Portfolio Dashboard.

Starts both the Python backend (FastAPI) and the Next.js frontend.

Usage:
  python start.py [--test] [--backend-port 8000] [--frontend-port 3000] [--no-venv]
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT, "backend")
FRONTEND_DIR = os.path.join(ROOT, "frontend")

processes: list[subprocess.Popen] = []

_PLACEHOLDER_API_KEY_ID = "your-api-key-id"
_PLACEHOLDER_API_SECRET = "your-api-secret"
_FIRST_START_SANDBOX_DIR = os.path.join(ROOT, "data", "first_start_sandbox")


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


def resolve_node_and_npm() -> tuple[str, str]:
    """Return (node_exe, npm_cmd) resolved from PATH."""
    node_exe = shutil.which("node") or ""
    npm_cmd = shutil.which("npm") or ""
    return node_exe, npm_cmd


def check_node(node_exe: str, npm_cmd: str):
    """Verify Node.js is installed and is version 18+."""
    if not npm_cmd or not os.path.exists(npm_cmd):
        print("ERROR: Node.js is not installed (npm not found).")
        print("Download it from: https://nodejs.org/")
        print("  Recommended: LTS version (18 or newer)")
        sys.exit(1)

    if not node_exe or not os.path.exists(node_exe):
        print("ERROR: Node.js is not installed (node not found).")
        print("Download it from: https://nodejs.org/")
        sys.exit(1)

    try:
        result = subprocess.run(
            [node_exe, "--version"],
            capture_output=True,
            text=True,
            check=True,
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


def check_config_file(*, test_mode: bool):
    """Check config.json presence and print a helpful message.

    In non-test mode, config.json is required for live Composer sync, but we still
    start the app so the dashboard can show setup instructions instead of hanging.
    """
    config_path = os.path.join(ROOT, "config.json")
    if os.path.exists(config_path):
        print("  config.json ........... OK")
    else:
        if test_mode:
            print("  config.json ........... (missing, ok in --test mode)")
        else:
            print("  config.json ........... MISSING")
            print("  WARNING: Live mode requires Composer credentials.")
            print("           The dashboard will start and show setup instructions.")


def check_prerequisites(*, test_mode: bool, node_exe: str, npm_cmd: str):
    """Run all prerequisite checks."""
    print("Checking prerequisites...\n")
    check_python()
    check_node(node_exe, npm_cmd)
    check_config_file(test_mode=test_mode)
    print()


# ------------------------------------------------------------------
# Dependency installation
# ------------------------------------------------------------------


def _venv_python_path(venv_dir: str) -> str:
    if os.name == "nt":
        return os.path.join(venv_dir, "Scripts", "python.exe")
    return os.path.join(venv_dir, "bin", "python")


def ensure_backend_python(*, no_venv: bool) -> str:
    """Return python executable to use for backend (venv by default)."""
    if no_venv:
        return sys.executable

    venv_dir = os.path.join(BACKEND_DIR, ".venv")
    py = _venv_python_path(venv_dir)
    if not os.path.exists(py):
        print("Creating backend virtual environment (backend/.venv)...")
        try:
            subprocess.run([sys.executable, "-m", "venv", venv_dir], check=True)
        except subprocess.CalledProcessError:
            print("ERROR: Failed to create a virtual environment.")
            if os.name != "nt":
                print("Tip (Linux): you may need to install the venv package (e.g. python3-venv).")
            sys.exit(1)

    # Ensure pip exists in the venv (some environments disable ensurepip).
    try:
        subprocess.run([py, "-m", "pip", "--version"], capture_output=True, check=True, text=True)
    except Exception:
        try:
            subprocess.run([py, "-m", "ensurepip", "--upgrade"], check=True)
        except subprocess.CalledProcessError:
            print("ERROR: pip is not available in the backend venv.")
            sys.exit(1)

    return py


def install_deps(*, backend_python: str, npm_cmd: str):
    """Install dependencies if needed."""
    def _run_with_elapsed(cmd: list[str], *, cwd: str, progress_label: str):
        proc = subprocess.Popen(cmd, cwd=cwd)
        started = time.time()
        last_report = 0
        while proc.poll() is None:
            elapsed = int(time.time() - started)
            if elapsed >= 5 and elapsed - last_report >= 5:
                print(f"  {progress_label}... {elapsed}s elapsed")
                last_report = elapsed
            time.sleep(0.2)
        if proc.returncode:
            raise subprocess.CalledProcessError(proc.returncode, cmd)

    req = os.path.join(BACKEND_DIR, "requirements.txt")
    if os.path.exists(req):
        print("Checking Python dependencies...")
        try:
            _run_with_elapsed(
                [backend_python, "-m", "pip", "install", "-r", req, "-q"],
                cwd=BACKEND_DIR,
                progress_label="Checking Python dependencies",
            )
            print("  Python dependencies ........ OK")
        except subprocess.CalledProcessError:
            print("ERROR: Failed to install backend dependencies.")
            sys.exit(1)

    nm = os.path.join(FRONTEND_DIR, "node_modules")
    if not os.path.exists(nm):
        print("Installing frontend dependencies (first run only, may take a minute)...")
        try:
            subprocess.run([npm_cmd, "install"], cwd=FRONTEND_DIR, check=True)
        except subprocess.CalledProcessError:
            print("ERROR: Failed to install frontend dependencies.")
            sys.exit(1)


def validate_config_credentials(*, config_path: str | None = None) -> tuple[bool, str | None]:
    """Validate config.json has usable Composer credentials (non-test mode).

    Returns (ok, message). Never raises.
    """
    if config_path is None:
        config_path = os.path.join(ROOT, "config.json")
    if not os.path.exists(config_path):
        return False, (
            "config.json not found.\n"
            "Fix:\n"
            "1) Copy config.json.example to config.json\n"
            "2) Edit config.json and add your Composer API credentials\n"
            "3) Restart: python start.py\n"
            "Tip: For a demo without real credentials, run: python start.py --test"
        )

    try:
        with open(config_path, "r", encoding="utf-8-sig") as f:
            raw = json.load(f)
    except json.JSONDecodeError as e:
        return False, (
            f"config.json is not valid JSON (line {e.lineno}).\n"
            "Fix the syntax error and restart."
        )
    except Exception as e:
        return False, f"Failed to read config.json: {e}"

    if not isinstance(raw, dict):
        return False, "config.json must be a JSON object. Re-copy config.json.example and try again."

    account_list = raw.get("composer_accounts") or raw.get("accounts")
    if account_list is None:
        return False, (
            "config.json is missing 'composer_accounts'.\n"
            "Re-copy config.json.example to config.json and fill in your Composer API credentials."
        )

    if not isinstance(account_list, list) or len(account_list) == 0:
        return False, (
            "config.json must contain a non-empty 'composer_accounts' array.\n"
            "Copy config.json.example to config.json and fill in your Composer API credentials."
        )

    problems: list[str] = []
    for idx, entry in enumerate(account_list):
        if not isinstance(entry, dict):
            problems.append(f"composer_accounts[{idx}] must be an object with name/api_key_id/api_secret")
            continue
        name = str(entry.get("name") or f"#{idx + 1}")
        key_id = entry.get("api_key_id")
        secret = entry.get("api_secret")
        key_id_str = key_id.strip() if isinstance(key_id, str) else ""
        secret_str = secret.strip() if isinstance(secret, str) else ""

        missing_fields = []
        if not key_id_str:
            missing_fields.append("api_key_id missing")
        elif key_id_str.lower() == _PLACEHOLDER_API_KEY_ID:
            missing_fields.append("api_key_id is placeholder")
        if not secret_str:
            missing_fields.append("api_secret missing")
        elif secret_str.lower() == _PLACEHOLDER_API_SECRET:
            missing_fields.append("api_secret is placeholder")

        if missing_fields:
            problems.append(f"composer_accounts[{idx}] (name: {name}): " + ", ".join(missing_fields))

    if problems:
        msg = (
            "Composer API credentials are not configured in config.json.\n"
            "Update composer_accounts[*].api_key_id and composer_accounts[*].api_secret, then restart.\n"
            "Details:\n- "
            + "\n- ".join(problems)
        )
        return False, msg

    return True, None


def _sqlite_url_from_path(db_path: str) -> str:
    return f"sqlite:///{db_path.replace(os.sep, '/')}"


def prepare_first_start_sandbox() -> dict[str, str]:
    """Create a clean, isolated sandbox for repeatable first-start simulation."""
    if os.path.exists(_FIRST_START_SANDBOX_DIR):
        shutil.rmtree(_FIRST_START_SANDBOX_DIR, ignore_errors=True)
    os.makedirs(_FIRST_START_SANDBOX_DIR, exist_ok=True)

    source_path = os.path.join(ROOT, "config.json")
    if not os.path.exists(source_path):
        source_path = os.path.join(ROOT, "config.json.example")

    target_config_path = os.path.join(_FIRST_START_SANDBOX_DIR, "config.first_start.json")
    config_data: dict = {}
    if os.path.exists(source_path):
        with open(source_path, "r", encoding="utf-8-sig") as src_file:
            loaded = json.load(src_file)
            if isinstance(loaded, dict):
                config_data = loaded

    export_cfg = config_data.get("symphony_export")
    if not isinstance(export_cfg, dict):
        export_cfg = {}
    export_cfg["enabled"] = True
    # Keep first-start mode isolated from personal paths while matching
    # "new user" behavior (export on by default).
    export_cfg["local_path"] = os.path.join(_FIRST_START_SANDBOX_DIR, "symphony_exports")
    config_data["symphony_export"] = export_cfg

    snapshot_cfg = config_data.get("daily_snapshot")
    if not isinstance(snapshot_cfg, dict):
        legacy_snapshot_cfg = config_data.get("screenshot")
        snapshot_cfg = dict(legacy_snapshot_cfg) if isinstance(legacy_snapshot_cfg, dict) else {}
    snapshot_cfg["enabled"] = False
    # Keep first-start mode isolated from personal snapshot destinations.
    snapshot_cfg["local_path"] = os.path.join(_FIRST_START_SANDBOX_DIR, "daily_snapshots")
    config_data["daily_snapshot"] = snapshot_cfg
    config_data.pop("screenshot", None)

    with open(target_config_path, "w", encoding="utf-8") as target_file:
        json.dump(config_data, target_file, indent=2, ensure_ascii=False)
        target_file.write("\n")

    db_path = os.path.join(_FIRST_START_SANDBOX_DIR, "portfolio_first_start.db")
    local_write_base_dir = os.path.join(_FIRST_START_SANDBOX_DIR, "local_storage")
    os.makedirs(local_write_base_dir, exist_ok=True)
    run_id = str(int(time.time() * 1000))

    return {
        "PD_CONFIG_PATH": target_config_path,
        "PD_DATABASE_URL": _sqlite_url_from_path(db_path),
        "PD_LOCAL_WRITE_BASE_DIR": local_write_base_dir,
        "PD_FIRST_START_TEST_MODE": "1",
        "PD_FIRST_START_RUN_ID": run_id,
    }


# ------------------------------------------------------------------
# Browser auto-open
# ------------------------------------------------------------------


def open_browser_when_ready(url: str, timeout: int = 30):
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
    parser = argparse.ArgumentParser(description="Portfolio Dashboard launcher")
    parser.add_argument("--test", action="store_true", help="Enable __TEST__ demo account with synthetic data")
    parser.add_argument(
        "--first-start-test",
        action="store_true",
        help="Run a clean first-start simulation in an isolated sandbox (safe to repeat).",
    )
    parser.add_argument("--backend-port", type=int, default=8000, help="Backend port (default: 8000)")
    parser.add_argument("--frontend-port", type=int, default=3000, help="Frontend port (default: 3000)")
    parser.add_argument("--no-venv", action="store_true", help="Use current Python environment instead of backend/.venv")
    args = parser.parse_args()

    if args.test and args.first_start_test:
        print("ERROR: --test and --first-start-test cannot be used together.")
        sys.exit(1)

    if not (1 <= int(args.backend_port) <= 65535):
        print("ERROR: --backend-port must be between 1 and 65535.")
        sys.exit(1)
    if not (1 <= int(args.frontend_port) <= 65535):
        print("ERROR: --frontend-port must be between 1 and 65535.")
        sys.exit(1)

    node_exe, npm_cmd = resolve_node_and_npm()
    check_prerequisites(test_mode=args.test, node_exe=node_exe, npm_cmd=npm_cmd)

    backend_python = ensure_backend_python(no_venv=args.no_venv)
    install_deps(backend_python=backend_python, npm_cmd=npm_cmd)

    print("=" * 50)
    print("  Portfolio Dashboard")
    if args.test:
        print("  (Test mode enabled)")
    print("=" * 50)

    # Build env for backend and propagate test mode flags.
    backend_env = os.environ.copy()
    first_start_env: dict[str, str] = {}
    if args.first_start_test:
        first_start_env = prepare_first_start_sandbox()
        print("  First-start sandbox ...... enabled")
        print(f"  Sandbox path ............. {_FIRST_START_SANDBOX_DIR}")

    if args.test:
        backend_env["PD_TEST_MODE"] = "1"
        backend_env["PD_DATABASE_URL"] = "sqlite:///data/portfolio_test.db"
        backend_env.pop("PD_CONFIG_PATH", None)
        backend_env.pop("PD_LOCAL_WRITE_BASE_DIR", None)
        backend_env.pop("PD_FIRST_START_TEST_MODE", None)
        backend_env.pop("PD_FIRST_START_RUN_ID", None)
    else:
        backend_env.pop("PD_TEST_MODE", None)
        if not args.first_start_test:
            backend_env.pop("PD_DATABASE_URL", None)
            backend_env.pop("PD_CONFIG_PATH", None)
            backend_env.pop("PD_LOCAL_WRITE_BASE_DIR", None)
            backend_env.pop("PD_FIRST_START_TEST_MODE", None)
            backend_env.pop("PD_FIRST_START_RUN_ID", None)

        credential_config_path = first_start_env.get("PD_CONFIG_PATH") if args.first_start_test else None
        ok, msg = validate_config_credentials(config_path=credential_config_path)
        if not ok and msg:
            print("\n" + "=" * 50)
            print("  Setup Required")
            print("=" * 50)
            print(msg)
            print()

    if first_start_env:
        backend_env.update(first_start_env)

    # Strict origin allowlist for this run (dashboard origin only).
    backend_env["PD_ALLOWED_ORIGINS"] = (
        f"http://localhost:{int(args.frontend_port)},http://127.0.0.1:{int(args.frontend_port)}"
    )

    # Start backend
    print("\nStarting backend...")
    backend = subprocess.Popen(
        [
            backend_python,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(int(args.backend_port)),
            "--reload",
        ],
        cwd=BACKEND_DIR,
        env=backend_env,
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
            urllib.request.urlopen(f"http://localhost:{int(args.backend_port)}/api/health", timeout=2)
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
    frontend_env = os.environ.copy()
    frontend_env["NEXT_PUBLIC_API_URL"] = f"http://localhost:{int(args.backend_port)}/api"
    frontend_env["PORT"] = str(int(args.frontend_port))
    frontend = subprocess.Popen(
        [npm_cmd, "run", "dev", "--", "-p", str(int(args.frontend_port))],
        cwd=FRONTEND_DIR,
        env=frontend_env,
    )
    processes.append(frontend)

    # Auto-open browser in background thread
    frontend_url = f"http://localhost:{int(args.frontend_port)}"
    threading.Thread(
        target=open_browser_when_ready,
        args=(frontend_url,),
        daemon=True,
    ).start()

    print(f"\n  Dashboard:  {frontend_url}")
    print(f"  API docs:   http://localhost:{int(args.backend_port)}/docs")
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

