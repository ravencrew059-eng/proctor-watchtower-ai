# AI Proctoring Python Backend

This is the Python backend service for real-time exam proctoring using YOLOv8n and MediaPipe.

## Setup

1. **Install Python 3.9+**

2. **Install dependencies:**
```bash
cd python-backend
pip install -r requirements.txt
```

3. **Download YOLOv8n model:**
```bash
python download_model.py
```

4. **Set environment variables:**
```bash
export SUPABASE_URL="https://ukwnvvuqmiqrjlghgxnf.supabase.co"
export SUPABASE_KEY="your-supabase-key"
```

5. **Run the server:**
```bash
python server.py
```

The server will start on `http://localhost:8000`

## API Endpoints

- `GET /` - Service information
- `GET /health` - Health check
- `POST /calibrate` - Calibrate head pose
- `POST /environment-check` - Check environment (lighting, face detection)
- `POST /process-frame` - Process single frame for violations
- `WS /ws/proctoring/{session_id}` - WebSocket for real-time monitoring

## Features

### Detection Capabilities
- **Face Detection**: Multiple faces, no person detection
- **Object Detection**: Phone, books, unauthorized objects (using YOLOv8n)
- **Head Pose**: Looking away detection (using MediaPipe)
- **Audio Monitoring**: Excessive noise detection
- **Lighting**: Environment lighting check

### Real-time Monitoring
- WebSocket connection for live frame processing
- Automatic violation detection with confidence scores
- Snapshot capture for evidence

## Docker Deployment (Optional)

```bash
docker build -t proctoring-backend .
docker run -p 8000:8000 -e SUPABASE_URL=your-url -e SUPABASE_KEY=your-key proctoring-backend
```

## Integration with Frontend

The frontend connects via WebSocket to send video frames and receive violation alerts in real-time. See `src/hooks/useProctoringWebSocket.ts` for the client implementation.
