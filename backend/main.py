import asyncio
import random
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def generate_vitals():
    return {
        "heart_rate": random.randint(60, 110),
        "spo2": round(random.uniform(92, 100), 1),
        "blood_pressure_systolic": random.randint(110, 160),
        "blood_pressure_diastolic": random.randint(70, 100),
        "respiratory_rate": random.randint(12, 25),
    }


@app.websocket("/ws/vitals")
async def vitals_stream(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            vitals = generate_vitals()
            await websocket.send_json(vitals)
            await asyncio.sleep(2)
    except Exception:
        await websocket.close()
