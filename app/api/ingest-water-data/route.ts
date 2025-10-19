import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";

if (!admin.apps.length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccount) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT environment variable");
  }

  try {
    const serviceAccountJSON = JSON.parse(serviceAccount);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountJSON),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  } catch (error) {
    throw new Error("Failed to initialize Firebase Admin SDK: " + (error instanceof Error ? error.message : "Unknown error"));
  }
}

const db = admin.database();

interface WaterDataPayload {
  deviceId: string;
  timestamp: number; // Unix timestamp
  flowRate: number; // Current L/min reading
  pulseCount?: number; // Optional: raw pulses since last reading
  interval?: number; // Optional: milliseconds since last reading
}

interface DeviceMetadata {
  sensorType?: string;
  location?: string;
  calibration?: number;
}

function calculateLitersIncrement(flowRate: number, intervalMs: number): number {
  const intervalMinutes = intervalMs / 60000;
  return flowRate * intervalMinutes;
}

async function getDailyTotal(deviceId: string, currentTimestamp: number): Promise<number> {
  const now = new Date(currentTimestamp * 1000);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDayTimestamp = Math.floor(startOfDay.getTime() / 1000);

  try {
    const ref = db.ref(`water_readings/${deviceId}`);
    const snapshot = await ref.orderByKey().startAt(startOfDayTimestamp.toString()).once("value");

    if (!snapshot.exists()) {
      return 0;
    }

    let total = 0;
    snapshot.forEach((childSnapshot) => {
      const data = childSnapshot.val();
      if (data.litersIncrement) {
        total += data.litersIncrement;
      }
    });

    return total;
  } catch (error) {
    console.error("Error calculating daily total:", error);
    return 0;
  }
}

async function getDeviceMetadata(deviceId: string): Promise<DeviceMetadata> {
  try {
    const ref = db.ref(`devices/${deviceId}/metadata`);
    const snapshot = await ref.once("value");
    return snapshot.val() || {};
  } catch (error) {
    console.error("Error fetching device metadata:", error);
    return {};
  }
}

function detectAnomalies(flowRate: number, dailyTotal: number): string[] {
  const anomalies: string[] = [];

  if (flowRate > 15) {
    anomalies.push("high_flow_rate");
  }

  if (dailyTotal > 500) {
    anomalies.push("high_daily_consumption");
  }

  if (flowRate > 0 && flowRate < 0.5) {
    anomalies.push("possible_leak");
  }

  return anomalies;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const apiKey = process.env.API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization header" }, { status: 401 });
    }

    const token = authHeader.substring(7);

    if (token !== apiKey) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 403 });
    }

    const body: WaterDataPayload = await request.json();

    if (!body.deviceId || typeof body.timestamp !== "number" || typeof body.flowRate !== "number") {
      return NextResponse.json({ error: "Invalid payload: deviceId, timestamp, and flowRate are required" }, { status: 400 });
    }

    const metadata = await getDeviceMetadata(body.deviceId);

    const intervalMs = body.interval || 5000;
    const litersIncrement = calculateLitersIncrement(body.flowRate, intervalMs);

    const previousDailyTotal = await getDailyTotal(body.deviceId, body.timestamp);
    const dailyTotal = previousDailyTotal + litersIncrement;

    const anomalies = detectAnomalies(body.flowRate, dailyTotal);

    const readingData = {
      deviceId: body.deviceId,
      timestamp: body.timestamp,
      timestampISO: new Date(body.timestamp * 1000).toISOString(),

      flowRate: body.flowRate,
      pulseCount: body.pulseCount || null,
      interval: intervalMs,

      litersIncrement: parseFloat(litersIncrement.toFixed(4)),
      dailyTotal: parseFloat(dailyTotal.toFixed(3)),

      sensorType: metadata.sensorType || null,
      location: metadata.location || null,

      anomalies: anomalies.length > 0 ? anomalies : null,

      createdAt: admin.database.ServerValue.TIMESTAMP,
    };

    const ref = db.ref(`water_readings/${body.deviceId}/${body.timestamp}`);
    await ref.set(readingData);

    return NextResponse.json(
      {
        success: true,
        message: "Water data ingested successfully",
        data: {
          deviceId: body.deviceId,
          timestamp: body.timestamp,
          flowRate: body.flowRate,
          litersIncrement: readingData.litersIncrement,
          dailyTotal: readingData.dailyTotal,
          anomalies: anomalies.length > 0 ? anomalies : null,
          path: `water_readings/${body.deviceId}/${body.timestamp}`,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Request error:", error);
    return NextResponse.json(
      { error: "Invalid request", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    }
  );
}
