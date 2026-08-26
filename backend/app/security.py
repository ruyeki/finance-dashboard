import hmac

from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, Request, status
from itsdangerous import BadSignature, URLSafeTimedSerializer

from app.config import settings

SESSION_COOKIE = "fd_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 30  # 30 days

_serializer = URLSafeTimedSerializer(settings.secret_key, salt="fd-session")


def verify_password(candidate: str) -> bool:
    return hmac.compare_digest(candidate, settings.app_password)


def create_session_token() -> str:
    return _serializer.dumps({"authed": True})


def validate_session_token(token: str) -> bool:
    try:
        _serializer.loads(token, max_age=SESSION_MAX_AGE)
        return True
    except BadSignature:
        return False


def require_auth(request: Request) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token or not validate_session_token(token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


# --- Fernet encryption for Plaid access tokens ---

def _fernet() -> Fernet:
    if not settings.encryption_key:
        raise RuntimeError("ENCRYPTION_KEY is not set")
    return Fernet(settings.encryption_key.encode())


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    return _fernet().decrypt(value.encode()).decode()


AuthDep = Depends(require_auth)
