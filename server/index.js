import { Server } from "socket.io";
import { spawn } from "child_process";
import dotenv from "dotenv";

dotenv.config();

const io = new Server(8001, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  let ffmpegProcess = null;

  // Handle the initial stream configuration from the client
  socket.on("start:stream", ({ streamUrl, streamKey }) => {
    console.log(`Received start stream request from ${socket.id}`);

    if (ffmpegProcess) {
      console.log("FFmpeg process already exists. Killing it.");
      ffmpegProcess.kill("SIGINT");
    }

    // FFmpeg options
    const options = [
      "-i",
      "-",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-tune",
      "zerolatency",
      "-r",
      `${25}`,
      "-g",
      `${25 * 2}`,
      "-keyint_min",
      25,
      "-crf",
      "25",
      "-pix_fmt",
      "yuv420p",
      "-sc_threshold",
      "0",
      "-profile:v",
      "main",
      "-level",
      "3.1",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      128000 / 4,
      "-f",
      "flv",
      `${streamUrl}/${streamKey}`, // This is where the RTMP URL is passed
    ];

    // Spawn a new FFmpeg process for this specific stream
    ffmpegProcess = spawn("ffmpeg", options);

    // Error and exit handlers
    ffmpegProcess.stderr.on("data", (data) => {
      console.error(`FFmpeg stderr (${socket.id}): ${data}`);
    });

    ffmpegProcess.on("close", (code) => {
      console.log(`FFmpeg process for ${socket.id} closed with code ${code}`);
      ffmpegProcess = null;
    });

    // Send the 'stream:ready' signal back to the client
    socket.emit("stream:ready");
    console.log(`Sent stream:ready to client ${socket.id}`);
  });

  // Handle incoming video chunks from the client
  socket.on("video-chunk", (stream) => {
    if (ffmpegProcess && !ffmpegProcess.stdin.writableEnded) {
      ffmpegProcess.stdin.write(stream, (err) => {
        if (err) {
          console.error(`Error writing to FFmpeg stdin for ${socket.id}:`, err);
        }
      });
    }
  });

  // Gracefully stop the stream
  socket.on("stop:stream", () => {
    if (ffmpegProcess) {
      console.log(
        `Received stop:stream from ${socket.id}. Killing FFmpeg process.`
      );
      ffmpegProcess.kill("SIGINT");
    }
  });

  // Clean up when the socket disconnects
  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
    if (ffmpegProcess) {
      ffmpegProcess.kill("SIGINT");
    }
  });
});
