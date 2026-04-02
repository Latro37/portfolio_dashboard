from __future__ import annotations

import os
import subprocess

import pytest

import start


def test_ensure_backend_python_bootstraps_pip_inside_backend_venv(
    monkeypatch: pytest.MonkeyPatch,
):
    backend_dir = os.path.join("C:\\", "fake", "backend")
    venv_dir = os.path.join(backend_dir, ".venv")
    backend_python = start._venv_python_path(venv_dir)
    launcher_python = os.path.join("C:\\", "fake", "launcher-python.exe")

    monkeypatch.setattr(start, "BACKEND_DIR", backend_dir)
    monkeypatch.setattr(start.sys, "executable", launcher_python)
    monkeypatch.setattr(start, "_backend_venv_rebuild_reason", lambda *_args, **_kwargs: "it does not exist yet")
    monkeypatch.setattr(start, "_create_backend_venv", lambda *_args, **_kwargs: backend_python)

    commands: list[list[str]] = []
    pip_ready = False

    def fake_run(cmd: list[str], **_kwargs):
        nonlocal pip_ready
        command = [str(part) for part in cmd]
        commands.append(command)
        if command == [backend_python, "-m", "pip", "--version"]:
            if pip_ready:
                return subprocess.CompletedProcess(command, 0, stdout="pip 25.0\n")
            raise subprocess.CalledProcessError(1, command)
        if command == [backend_python, "-m", "ensurepip", "--upgrade"]:
            pip_ready = True
            return subprocess.CompletedProcess(command, 0)
        raise AssertionError(f"Unexpected subprocess.run call: {command}")

    monkeypatch.setattr(start.subprocess, "run", fake_run)

    resolved_python = start.ensure_backend_python(no_venv=False)

    assert resolved_python == backend_python
    assert [backend_python, "-m", "ensurepip", "--upgrade"] in commands
    assert not any(command[:3] == [launcher_python, "-m", "pip"] for command in commands)


def test_install_deps_uses_backend_python_pip(
    monkeypatch: pytest.MonkeyPatch,
):
    backend_dir = os.path.join("C:\\", "fake", "backend")
    frontend_dir = os.path.join("C:\\", "fake", "frontend")
    req = os.path.join(backend_dir, "requirements.txt")
    node_modules = os.path.join(frontend_dir, "node_modules")
    backend_python = start._venv_python_path(os.path.join(backend_dir, ".venv"))
    commands: list[list[str]] = []

    class _Proc:
        def __init__(self):
            self.returncode = None
            self._polled = False

        def poll(self):
            if not self._polled:
                self._polled = True
                return None
            self.returncode = 0
            return 0

    def fake_exists(path: str) -> bool:
        return path in {req, node_modules}

    def fake_popen(cmd: list[str], **_kwargs):
        commands.append([str(part) for part in cmd])
        return _Proc()

    monkeypatch.setattr(start, "BACKEND_DIR", backend_dir)
    monkeypatch.setattr(start, "FRONTEND_DIR", frontend_dir)
    monkeypatch.setattr(start.os.path, "exists", fake_exists)
    monkeypatch.setattr(start.subprocess, "Popen", fake_popen)
    monkeypatch.setattr(start.time, "sleep", lambda *_args, **_kwargs: None)

    start.install_deps(backend_python=backend_python, npm_cmd="npm")

    assert commands
    assert commands[0][:3] == [backend_python, "-m", "pip"]
