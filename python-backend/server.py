"""
FastAPI Server for AI Proctoring with WebSocket Support
Integrates YOLOv8n and MediaPipe for real-time exam monitoring
"""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List
import base64
import cv2
import numpy as np
from datetime import datetime
import asyncio
import logging
import json
from supabase import create_client, Client
import os

from proctoring_service import ProctoringService
from models import (
    FrameProcessRequest,
    FrameProcessResponse,
    CalibrationRequest,
    CalibrationResponse,
    EnvironmentCheckRequest,
    EnvironmentCheck,
    ViolationDetail
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(title="AI Proctoring Service", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Supabase client
supabase_url = os.getenv("SUPABASE_URL", "https://ukwnvvuqmiqrjlghgxnf.supabase.co")
supabase_key = os.getenv("SUPABASE_KEY", "")
supabase: Client = create_client(supabase_url, supabase_key)

# Initialize Proctoring Service
proctoring_service = ProctoringService()

# Active WebSocket connections
active_connections: Dict[str, WebSocket] = {}

@app.get("/")
async def root():
    return {
        "service": "AI Proctoring Service",
        "status": "running",
        "version": "1.0.0",
        "models": {
            "yolo": proctoring_service.yolo_model is not None,
            "mediapipe": proctoring_service.mp_face_mesh is not None
        }
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "models_loaded": proctoring_service.yolo_model is not None
    }

@app.post("/calibrate", response_model=CalibrationResponse)
async def calibrate(request: CalibrationRequest):
    """Calibrate head pose for a student"""
    try:
        # Decode base64 frame
        frame_data = base64.b64decode(request.frame_base64.split(',')[1] if ',' in request.frame_base64 else request.frame_base64)
        nparr = np.frombuffer(frame_data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return CalibrationResponse(success=False, message="Invalid frame data")
        
        # Get calibration values
        result = proctoring_service.calibrate_head_pose(frame)
        
        if result['success']:
            return CalibrationResponse(
                success=True,
                pitch=result['pitch'],
                yaw=result['yaw'],
                message="Calibration successful"
            )
        else:
            return CalibrationResponse(
                success=False,
                message=result.get('message', 'Calibration failed')
            )
    except Exception as e:
        logger.error(f"Calibration error: {e}")
        return CalibrationResponse(success=False, message=str(e))

@app.post("/environment-check", response_model=EnvironmentCheck)
async def check_environment(request: EnvironmentCheckRequest):
    """Check lighting and face detection for environment verification"""
    try:
        # Decode base64 frame
        frame_data = base64.b64decode(request.frame_base64.split(',')[1] if ',' in request.frame_base64 else request.frame_base64)
        nparr = np.frombuffer(frame_data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return EnvironmentCheck(
                lighting_ok=False,
                face_detected=False,
                face_centered=False,
                message="Invalid frame data"
            )
        
        # Check environment
        result = proctoring_service.check_environment(frame)
        
        return EnvironmentCheck(
            lighting_ok=result['lighting_ok'],
            face_detected=result['face_detected'],
            face_centered=result['face_centered'],
            message=result['message']
        )
    except Exception as e:
        logger.error(f"Environment check error: {e}")
        return EnvironmentCheck(
            lighting_ok=False,
            face_detected=False,
            face_centered=False,
            message=str(e)
        )

@app.post("/process-frame", response_model=FrameProcessResponse)
async def process_frame(request: FrameProcessRequest):
    """Process a single frame for violations"""
    try:
        # Decode base64 frame
        frame_data = base64.b64decode(request.frame_base64.split(',')[1] if ',' in request.frame_base64 else request.frame_base64)
        nparr = np.frombuffer(frame_data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            raise HTTPException(status_code=400, detail="Invalid frame data")
        
        # Process frame
        result = proctoring_service.process_frame(
            frame,
            request.session_id,
            request.calibrated_pitch,
            request.calibrated_yaw
        )
        
        # Convert violations to response format
        violations = [
            ViolationDetail(
                type=v['type'],
                severity=v['severity'],
                message=v['message'],
                confidence=v.get('confidence')
            )
            for v in result['violations']
        ]
        
        return FrameProcessResponse(
            timestamp=datetime.utcnow().isoformat(),
            violations=violations,
            head_pose=result.get('head_pose'),
            face_count=result['face_count'],
            looking_away=result['looking_away'],
            multiple_faces=result['multiple_faces'],
            no_person=result['no_person'],
            phone_detected=result['phone_detected'],
            book_detected=result['book_detected'],
            snapshot_base64=result.get('snapshot_base64')
        )
    except Exception as e:
        logger.error(f"Frame processing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws/proctoring/{session_id}")
async def websocket_proctoring(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time proctoring"""
    await websocket.accept()
    active_connections[session_id] = websocket
    logger.info(f"WebSocket connected: {session_id}")
    
    try:
        while True:
            # Receive frame data from client
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message['type'] == 'frame':
                # Process frame
                frame_data = base64.b64decode(message['frame'].split(',')[1] if ',' in message['frame'] else message['frame'])
                nparr = np.frombuffer(frame_data, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if frame is not None:
                    result = proctoring_service.process_frame(
                        frame,
                        session_id,
                        message.get('calibrated_pitch', 0.0),
                        message.get('calibrated_yaw', 0.0)
                    )
                    
                    # Send results back to client
                    await websocket.send_json({
                        'type': 'detection_result',
                        'data': result
                    })
                    
            elif message['type'] == 'audio':
                # Process audio level
                audio_level = message.get('audio_level', 0)
                if audio_level > 50:  # Noisy threshold
                    await websocket.send_json({
                        'type': 'violation',
                        'data': {
                            'type': 'excessive_noise',
                            'severity': 'medium',
                            'message': 'Excessive background noise detected',
                            'timestamp': datetime.utcnow().isoformat()
                        }
                    })
                    
            elif message['type'] == 'ping':
                await websocket.send_json({'type': 'pong'})
                
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {session_id}")
        if session_id in active_connections:
            del active_connections[session_id]
    except Exception as e:
        logger.error(f"WebSocket error for {session_id}: {e}")
        if session_id in active_connections:
            del active_connections[session_id]

@app.post("/upload-violation-snapshot")
async def upload_violation_snapshot(
    exam_id: str,
    student_id: str,
    student_name: str,
    violation_type: str,
    snapshot_base64: str
):
    """Upload violation snapshot to Supabase Storage"""
    try:
        # Decode base64 image
        image_data = base64.b64decode(snapshot_base64.split(',')[1] if ',' in snapshot_base64 else snapshot_base64)
        
        # Generate filename
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        filename = f"{exam_id}/{student_id}_{violation_type}_{timestamp}.jpg"
        
        # Upload to Supabase Storage
        response = supabase.storage.from_('violation-evidence').upload(
            filename,
            image_data,
            file_options={"content-type": "image/jpeg"}
        )
        
        # Get public URL
        public_url = supabase.storage.from_('violation-evidence').get_public_url(filename)
        
        return {
            "success": True,
            "url": public_url,
            "filename": filename
        }
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
