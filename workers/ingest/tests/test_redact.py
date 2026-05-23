import pytest
from app.redact import check_discrepancy, redact


def test_redact_email():
    r = redact("Email: user@example.com")
    assert "[EMAIL]" in r.text
    assert r.summary["email"] == 1


def test_redact_phone():
    r = redact("Call 555-867-5309")
    assert "[PHONE]" in r.text
    assert r.summary["phone"] == 1


def test_redact_ssn():
    r = redact("SSN 123-45-6789")
    assert "[SSN]" in r.text
    assert r.summary["ssn"] == 1


def test_redact_credit_card():
    r = redact("Card: 4111 1111 1111 1111")
    assert "[CREDIT_CARD]" in r.text
    assert r.summary["credit_card"] == 1


def test_redact_ip():
    r = redact("Host 192.168.1.1 responded")
    assert "[IP]" in r.text
    assert r.summary["ip_address"] == 1


def test_redact_clean_text():
    r = redact("Nothing sensitive here.")
    assert r.text == "Nothing sensitive here."
    assert r.summary == {}


def test_check_discrepancy_no_original():
    assert check_discrepancy(None, {"email": 1}) is True
    assert check_discrepancy(None, {}) is False


def test_check_discrepancy_more_found():
    assert check_discrepancy({"email": 1}, {"email": 2}) is True


def test_check_discrepancy_same():
    assert check_discrepancy({"email": 1}, {"email": 1}) is False


def test_check_discrepancy_new_type():
    assert check_discrepancy({"email": 1}, {"email": 1, "ssn": 1}) is True
