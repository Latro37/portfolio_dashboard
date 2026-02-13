"""Stop script for Composer Portfolio Visualizer.

Kills the backend (uvicorn/python on port 8000), frontend (node/next on port 3000),
and any zombie child processes left behind.

Usage: python stop.py
"""

import os
import sys
import subprocess
import signal


def get_pids_on_port(port: int) -> list[int]:
    """Return list of PIDs listening on or connected to the given port."""
    pids = set()
    try:
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True, text=True, timeout=10,
        )
        for line in result.stdout.splitlines():
            if f":{port}" in line:
                parts = line.split()
                if len(parts) >= 5:
                    try:
                        pids.add(int(parts[-1]))
                    except ValueError:
                        pass
    except Exception:
        pass
    pids.discard(0)
    return sorted(pids)


def get_child_pids(pid: int) -> list[int]:
    """Return all descendant PIDs of a given process (Windows)."""
    children = []
    try:
        result = subprocess.run(
            ["wmic", "process", "where", f"(ParentProcessId={pid})", "get", "ProcessId"],
            capture_output=True, text=True, timeout=10,
        )
        for line in result.stdout.splitlines():
            line = line.strip()
            if line.isdigit():
                child = int(line)
                if child != pid:
                    children.append(child)
                    children.extend(get_child_pids(child))
    except Exception:
        pass
    return children


def kill_pid(pid: int, force: bool = False):
    """Kill a single process. Try graceful first, then force."""
    try:
        if not force:
            os.kill(pid, signal.SIGTERM)
        else:
            subprocess.run(
                ["taskkill", "/F", "/PID", str(pid)],
                capture_output=True, timeout=10,
            )
    except (ProcessLookupError, PermissionError):
        pass
    except Exception:
        pass


def kill_tree(pid: int):
    """Kill a process and all its children."""
    children = get_child_pids(pid)
    # Kill children first (bottom-up)
    for child in reversed(children):
        kill_pid(child, force=True)
    kill_pid(pid, force=True)


def kill_by_name_and_port(name: str, port: int):
    """Kill processes matching a name pattern that are on a specific port."""
    port_pids = set(get_pids_on_port(port))
    if not port_pids:
        return 0

    killed = 0
    for pid in port_pids:
        try:
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                capture_output=True, text=True, timeout=10,
            )
            proc_name = result.stdout.strip().strip('"').split('"')[0].lower()
            # Kill if it matches the expected name or just kill anything on that port
            kill_tree(pid)
            killed += 1
            print(f"  Killed PID {pid} ({proc_name})")
        except Exception:
            kill_pid(pid, force=True)
            killed += 1
            print(f"  Killed PID {pid}")
    return killed


def kill_orphan_python_uvicorn():
    """Find and kill any orphan python processes running uvicorn."""
    killed = 0
    try:
        result = subprocess.run(
            ["wmic", "process", "where",
             "name='python.exe' and commandline like '%uvicorn%app.main%'",
             "get", "ProcessId"],
            capture_output=True, text=True, timeout=10,
        )
        for line in result.stdout.splitlines():
            line = line.strip()
            if line.isdigit():
                pid = int(line)
                kill_tree(pid)
                killed += 1
                print(f"  Killed orphan uvicorn PID {pid}")
    except Exception:
        pass
    return killed


def kill_orphan_node_next():
    """Find and kill any orphan node processes running next dev."""
    killed = 0
    try:
        result = subprocess.run(
            ["wmic", "process", "where",
             "name='node.exe' and commandline like '%next%dev%'",
             "get", "ProcessId"],
            capture_output=True, text=True, timeout=10,
        )
        for line in result.stdout.splitlines():
            line = line.strip()
            if line.isdigit():
                pid = int(line)
                kill_tree(pid)
                killed += 1
                print(f"  Killed orphan next-dev PID {pid}")
    except Exception:
        pass
    return killed


def main():
    print("=" * 50)
    print("  Stopping Composer Portfolio Visualizer")
    print("=" * 50)
    total = 0

    # 1. Kill backend (port 8000)
    print("\nBackend (port 8000):")
    count = kill_by_name_and_port("python", 8000)
    if not count:
        print("  No processes found on port 8000")
    total += count

    # 2. Kill frontend (port 3000)
    print("\nFrontend (port 3000):")
    count = kill_by_name_and_port("node", 3000)
    if not count:
        print("  No processes found on port 3000")
    total += count

    # 3. Kill orphan uvicorn processes
    print("\nOrphan uvicorn processes:")
    count = kill_orphan_python_uvicorn()
    if not count:
        print("  None found")
    total += count

    # 4. Kill orphan next-dev processes
    print("\nOrphan next-dev processes:")
    count = kill_orphan_node_next()
    if not count:
        print("  None found")
    total += count

    # 5. Final check — anything still on our ports?
    remaining = get_pids_on_port(8000) + get_pids_on_port(3000)
    if remaining:
        print(f"\nForce-killing {len(remaining)} remaining process(es)...")
        for pid in set(remaining):
            kill_pid(pid, force=True)
            print(f"  Force-killed PID {pid}")
            total += 1

    print(f"\nDone. {total} process(es) stopped.")


if __name__ == "__main__":
    main()
