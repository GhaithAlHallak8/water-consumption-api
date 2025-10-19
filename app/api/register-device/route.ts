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

interface DeviceRegistrationPayload {
  deviceId: string;
  sensorType: string;
  location: string;
  calibration?: number; // Pulses per liter
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

    const body: DeviceRegistrationPayload = await request.json();

    if (!body.deviceId || !body.sensorType || !body.location) {
      return NextResponse.json({ error: "Invalid payload: deviceId, sensorType, and location are required" }, { status: 400 });
    }

    const deviceData = {
      deviceId: body.deviceId,
      sensorType: body.sensorType,
      location: body.location,
      calibration: body.calibration || 330, // Default YF-S201 calibration
      registeredAt: admin.database.ServerValue.TIMESTAMP,
      lastUpdated: admin.database.ServerValue.TIMESTAMP,
    };

    const ref = db.ref(`devices/${body.deviceId}/metadata`);
    await ref.set(deviceData);

    return NextResponse.json(
      {
        success: true,
        message: "Device registered successfully",
        data: {
          deviceId: body.deviceId,
          sensorType: body.sensorType,
          location: body.location,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Registration error:", error);
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
