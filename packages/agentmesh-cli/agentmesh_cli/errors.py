from __future__ import annotations

from enum import IntEnum


class ExitCode(IntEnum):
    OK = 0
    GENERAL_ERROR = 1
    USAGE_ERROR = 2
    DAEMON_UNAVAILABLE = 10
    DISCOVERY_FAILED = 11
    INVOKE_FAILED = 12
    INSTALL_FAILED = 13
    ADAPTER_NOT_FOUND = 14


class CLIError(Exception):
    exit_code: ExitCode = ExitCode.GENERAL_ERROR

    def __init__(self, message: str, exit_code: ExitCode | None = None) -> None:
        super().__init__(message)
        if exit_code is not None:
            self.exit_code = exit_code


class DaemonUnavailableError(CLIError):
    exit_code = ExitCode.DAEMON_UNAVAILABLE


class DiscoveryFailedError(CLIError):
    exit_code = ExitCode.DISCOVERY_FAILED


class InvokeFailedError(CLIError):
    exit_code = ExitCode.INVOKE_FAILED


class InstallFailedError(CLIError):
    exit_code = ExitCode.INSTALL_FAILED


class AdapterNotFoundError(CLIError):
    exit_code = ExitCode.ADAPTER_NOT_FOUND
