from fastapi import APIRouter, HTTPException, Request, Response, status

from app.schemas import LoginRequest, MessageResponse
from app.security import (
    SESSION_COOKIE,
    SESSION_MAX_AGE,
    create_session_token,
    validate_session_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=MessageResponse)
def login(body: LoginRequest, response: Response) -> MessageResponse:
    if not verify_password(body.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password")
    token = create_session_token()
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=False,  # set True behind HTTPS in production
    )
    return MessageResponse(message="ok")


@router.post("/logout", response_model=MessageResponse)
def logout(response: Response) -> MessageResponse:
    response.delete_cookie(SESSION_COOKIE)
    return MessageResponse(message="ok")


@router.get("/me", response_model=MessageResponse)
def me(request: Request) -> MessageResponse:
    token = request.cookies.get(SESSION_COOKIE)
    if not token or not validate_session_token(token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return MessageResponse(message="authenticated")
