from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import close_pool, init_pool
from .redis_client import close_redis, get_redis
from .routers import chat, conversations, logs, metrics


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    get_redis()  # initialise client eagerly
    yield
    await close_pool()
    await close_redis()


app = FastAPI(title="something.chat API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(logs.router)
app.include_router(conversations.router)
app.include_router(metrics.router)
app.include_router(chat.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
