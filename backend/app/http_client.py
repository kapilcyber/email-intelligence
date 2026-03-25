import httpx

from app.config import get_settings


def httpx_client(*, timeout: float | None = None) -> httpx.Client:
    """
    Centralized HTTPX client with optional TLS overrides.
    - Default: verify TLS certificates.
    - If HTTP_CA_BUNDLE is set: verify using that CA bundle.
    - If HTTP_VERIFY_SSL=false: disable verification (dev/corporate MITM only).
    """
    settings = get_settings()
    verify: bool | str = True
    if getattr(settings, "http_ca_bundle", "").strip():
        verify = settings.http_ca_bundle.strip()
    elif not getattr(settings, "http_verify_ssl", True):
        verify = False

    kwargs: dict = {"verify": verify}
    if timeout is not None:
        kwargs["timeout"] = timeout
    return httpx.Client(**kwargs)
