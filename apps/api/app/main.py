from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import close_pool, init_pool
from .redis_client import close_redis, get_redis


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    get_redis()  # initialise client eagerly
    yield
    await close_pool()
    await close_redis()


app = FastAPI(title="something.chat API", version="0.1.0", lifespan=lifespan)

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
