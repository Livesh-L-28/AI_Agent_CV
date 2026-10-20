"""
Unit tests for sentinel.logging
"""

import json
import logging

from sentinel.logging import (
    ConsoleFormatter,
    JSONFormatter,
    get_correlation_id,
    set_correlation_id,
    setup_logging,
)


def test_correlation_id_context():
    assert get_correlation_id() is None
    set_correlation_id("test-corr-123")
    assert get_correlation_id() == "test-corr-123"


def test_json_formatter():
    formatter = JSONFormatter()
    record = logging.LogRecord(
        name="sentinel.test",
        level=logging.INFO,
        pathname="test.py",
        lineno=10,
        msg="Worker entered restricted zone",
        args=(),
        exc_info=None,
    )
    set_correlation_id("corr-abc-999")
    output = formatter.format(record)
    data = json.loads(output)

    assert data["level"] == "INFO"
    assert data["logger"] == "sentinel.test"
    assert data["message"] == "Worker entered restricted zone"
    assert data["correlation_id"] == "corr-abc-999"
    assert "timestamp" in data


def test_console_formatter():
    formatter = ConsoleFormatter()
    record = logging.LogRecord(
        name="sentinel.test",
        level=logging.WARNING,
        pathname="test.py",
        lineno=15,
        msg="Zone persistence threshold reached",
        args=(),
        exc_info=None,
    )
    set_correlation_id("corr-456")
    output = formatter.format(record)

    assert "WARNING" in output
    assert "sentinel.test" in output
    assert "corr-456" in output
    assert "Zone persistence threshold reached" in output


def test_setup_logging():
    logger = setup_logging(level="DEBUG", json_format=False)
    assert logger.name == "sentinel"
    assert logging.getLogger().level == logging.DEBUG
