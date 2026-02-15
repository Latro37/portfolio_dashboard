from __future__ import annotations

import os

import pytest

from app.services.local_paths import LocalPathError, resolve_local_write_path


def test_resolve_relative_path_under_base(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setenv("PD_LOCAL_WRITE_BASE_DIR", str(tmp_path))
    resolved = resolve_local_write_path("screenshots")
    assert resolved == os.path.realpath(str(tmp_path / "screenshots"))


def test_reject_parent_escape(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setenv("PD_LOCAL_WRITE_BASE_DIR", str(tmp_path))
    with pytest.raises(LocalPathError, match="approved base directory"):
        resolve_local_write_path("../outside")


def test_reject_unc_path(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setenv("PD_LOCAL_WRITE_BASE_DIR", str(tmp_path))
    with pytest.raises(LocalPathError, match="UNC/network paths are not allowed"):
        resolve_local_write_path(r"\\\\server\\share")
