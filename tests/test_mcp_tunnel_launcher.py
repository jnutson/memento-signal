"""Credential handoff tests use fake values and never open a network connection."""
import copy
import json
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

import pytest

from tools import run_mcp_tunnel


def test_hidden_key_is_passed_only_in_child_environment(tmp_path, monkeypatch, capsys):
    binary = tmp_path / 'data/mcp/bin/tunnel-client'
    binary.parent.mkdir(parents=True)
    binary.write_text('synthetic placeholder; not executable')
    monkeypatch.setattr(run_mcp_tunnel, 'ROOT', tmp_path)
    monkeypatch.setattr(run_mcp_tunnel, 'preflight', lambda root: {'signal_set_id': 'mss_' + '1' * 64})
    monkeypatch.setattr(sys, 'argv', ['run_mcp_tunnel', '--tunnel-id', 'tunnel_' + '1' * 32])
    monkeypatch.setattr(sys, 'stdin', SimpleNamespace(isatty=lambda: True))
    monkeypatch.delenv('CONTROL_PLANE_API_KEY', raising=False)
    monkeypatch.setattr(run_mcp_tunnel.getpass, 'getpass', lambda prompt: 'synthetic-test-credential')
    calls = []
    def run(args, **kwargs):
        calls.append((args, copy.deepcopy(kwargs)))
        return SimpleNamespace(stdout=json.dumps({'process_running': True, 'healthy': True, 'ready': True,
                                                  'tmux': {'running': False}}))
    monkeypatch.setattr(run_mcp_tunnel.subprocess, 'run', run)
    run_mcp_tunnel.main()
    assert calls[0][1]['env']['CONTROL_PLANE_API_KEY'] == 'synthetic-test-credential'
    assert 'synthetic-test-credential' not in str(calls[0][0])
    assert 'env:CONTROL_PLANE_API_KEY' in calls[0][0]
    assert 'env' not in calls[1][1]
    output = capsys.readouterr().out
    assert 'synthetic-test-credential' not in output
    assert 'Ready for testing.' in output
    assert 'tmux' not in output
    assert list(tmp_path.rglob('*')) == [tmp_path / 'data', tmp_path / 'data/mcp', tmp_path / 'data/mcp/bin', binary]


def test_noninteractive_key_entry_fails_closed(tmp_path, monkeypatch):
    binary = tmp_path / 'data/mcp/bin/tunnel-client'
    binary.parent.mkdir(parents=True)
    binary.touch()
    monkeypatch.setattr(run_mcp_tunnel, 'ROOT', tmp_path)
    monkeypatch.setattr(run_mcp_tunnel, 'preflight', lambda root: {'signal_set_id': 'mss_' + '1' * 64})
    monkeypatch.setattr(sys, 'argv', ['run_mcp_tunnel', '--tunnel-id', 'tunnel_' + '1' * 32])
    monkeypatch.setattr(sys, 'stdin', SimpleNamespace(isatty=lambda: False))
    monkeypatch.delenv('CONTROL_PLANE_API_KEY', raising=False)
    with pytest.raises(SystemExit) as error:
        run_mcp_tunnel.main()
    assert error.value.code == 2


def test_saved_connection_reaches_hidden_prompt_without_manual_tunnel_id(tmp_path, monkeypatch):
    binary = tmp_path / 'data/mcp/bin/tunnel-client'
    binary.parent.mkdir(parents=True)
    binary.touch()
    (tmp_path / 'data/mcp/tunnel-connection.json').write_text(json.dumps({'tunnel_id': 'tunnel_' + '1' * 32}))
    monkeypatch.setattr(run_mcp_tunnel, 'ROOT', tmp_path)
    monkeypatch.setattr(run_mcp_tunnel, 'preflight', lambda root: {'signal_set_id': 'mss_' + '1' * 64})
    monkeypatch.setattr(sys, 'argv', ['run_mcp_tunnel'])
    monkeypatch.setattr(sys, 'stdin', SimpleNamespace(isatty=lambda: True))
    monkeypatch.delenv('CONTROL_PLANE_API_KEY', raising=False)
    monkeypatch.setattr(run_mcp_tunnel.getpass, 'getpass', lambda prompt: 'synthetic-test-credential')
    calls = []
    def run(args, **kwargs):
        calls.append(args)
        return SimpleNamespace(stdout=json.dumps({'process_running': True, 'healthy': True, 'ready': True}))
    monkeypatch.setattr(run_mcp_tunnel.subprocess, 'run', run)
    run_mcp_tunnel.main()
    assert 'tunnel_' + '1' * 32 in calls[0]


def test_command_launcher_works_outside_project_directory(tmp_path):
    launcher = Path(__file__).resolve().parents[1] / 'start-memento-loop.command'
    result = subprocess.run([str(launcher), '--help'], cwd=tmp_path, capture_output=True, text=True)
    assert result.returncode == 0
    assert 'Defaults to the locally saved private tunnel connection' in ' '.join(result.stdout.split())
