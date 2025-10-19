import machine
import network
import urequests
import ujson
import time
from machine import Pin
import ntptime

WIFI_SSID = "ahlan"
WIFI_PASSWORD = "Oce@n#2025"

API_ENDPOINT = "https://b58cb47910a4.ngrok-free.app/api/ingest-water-data"
API_KEY = "9W-HjgU7rOJzBdJS9bdEsj3eDULubAQGZI4ymuj7X9I"
DEVICE_ID = "watersaver-esp8266-001"

FLOW_PIN = 5 
CALIBRATION = 330  
SEND_INTERVAL = 5000

pulse_count = 0
flow_lpm = 0.0
last_calculation = 0
last_send = 0
wifi_connected = False

def sync_time():
    try:
        print("Syncing time with NTP...")
        ntptime.settime()
        print(f"✅ Time synced: {time.localtime()}")
        return True
    except Exception as e:
        print(f"❌ NTP sync failed: {e}")
        return False

def pulse_counter(pin):
    global pulse_count
    pulse_count += 1

def connect_wifi():
    global wifi_connected
    
    sta_if = network.WLAN(network.STA_IF)
    sta_if.active(True)
    
    if sta_if.isconnected():
        wifi_connected = True
        print(f"Already connected: {sta_if.ifconfig()[0]}")
        return True
    
    print(f"Connecting to WiFi: {WIFI_SSID}")
    sta_if.connect(WIFI_SSID, WIFI_PASSWORD)
    
    timeout = 15
    while not sta_if.isconnected() and timeout > 0:
        print(f"Connecting... ({timeout}s remaining)")
        time.sleep(1)
        timeout -= 1
    
    if sta_if.isconnected():
        wifi_connected = True
        ip = sta_if.ifconfig()[0]
        print(f"WiFi Connected! IP: {ip}")
        return True
    else:
        wifi_connected = False
        print("WiFi connection failed!")
        return False

def calculate_flow():
    global pulse_count, flow_lpm, last_calculation
    
    current_time = time.ticks_ms()
    
    # Calculate every 1 second
    if time.ticks_diff(current_time, last_calculation) >= 1000:
        time_elapsed = time.ticks_diff(current_time, last_calculation) / 1000.0
        
        pulses_per_second = pulse_count / time_elapsed
        flow_lpm = (pulses_per_second * 60) / CALIBRATION
        
        pulse_count = 0
        last_calculation = current_time
        
        return True
    
    return False

def send_to_server(flow_rate, interval_ms):    
    if not wifi_connected:
        print("No WiFi - skipping data send")
        return False
    
    try:
        timestamp = time.time()  # Unix timestamp
        payload = {
            "deviceId": DEVICE_ID,
            "timestamp": timestamp,
            "flowRate": round(flow_rate, 3), 
            "interval": interval_ms  
        }
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}",
            "User-Agent": "WaterSaver-ESP8266"
        }
        
        print(f"Sending: Flow={flow_rate:.2f}L/min")
        
        response = urequests.post(
            API_ENDPOINT,
            data=ujson.dumps(payload),
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            print(f"✅ Data sent successfully")
            try:
                result = response.json()

                if "data" in result:
                    data = result["data"]
                    print(f"   Daily total: {data.get('dailyTotal', 0):.3f}L")
                    if data.get("anomalies"):
                        print(f"   ⚠️  Anomalies detected: {data['anomalies']}")
            except:
                pass
        else:
            print(f"❌ Server error: {response.status_code}")
        
        response.close()
        return True
        
    except OSError as e:
        print(f"❌ Network error: {e}")
        return False
    except Exception as e:
        print(f"❌ Send error: {e}")
        return False

def register_device():
    if not wifi_connected:
        print("No WiFi - skipping device registration")
        return False
    
    try:
        payload = {
            "deviceId": DEVICE_ID,
            "sensorType": "YF-S201",
            "location": "kitchen", 
            "calibration": CALIBRATION
        }
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}"
        }
        
        print("Registering device...")
        
        response = urequests.post(
            API_ENDPOINT.replace("/ingest-water-data", "/register-device"),
            data=ujson.dumps(payload),
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            print("✅ Device registered successfully")
            return True
        else:
            print(f"❌ Registration failed: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Registration error: {e}")
        return False

def main():
    global last_send, last_calculation
    
    print("=== WaterSaver AI - Optimized Flow Monitor ===")
    print(f"Device ID: {DEVICE_ID}")
    print(f"Flow sensor on GPIO {FLOW_PIN}")
    print(f"Send interval: {SEND_INTERVAL}ms")
    
    flow_pin = Pin(FLOW_PIN, Pin.IN, Pin.PULL_UP)
    flow_pin.irq(trigger=Pin.IRQ_FALLING, handler=pulse_counter)
    print("✅ Flow sensor initialized")
    
    if connect_wifi():
        sync_time()
        # register_device()
    
    last_calculation = time.ticks_ms()
    last_send = time.ticks_ms()
    
    print("🚀 Starting monitoring loop...")
    print("Pour water through sensor to test!")
    
    consecutive_errors = 0
    
    while True:
        try:
            flow_updated = calculate_flow()
            
            if flow_updated:
                print(f"Flow: {flow_lpm:.2f} L/min")
                
                current_time = time.ticks_ms()
                time_since_send = time.ticks_diff(current_time, last_send)
                
                if time_since_send >= SEND_INTERVAL:
                    success = send_to_server(flow_lpm, time_since_send)
                    
                    if success:
                        last_send = current_time
                        consecutive_errors = 0
                    else:
                        consecutive_errors += 1
                        
                        if consecutive_errors >= 3:
                            print("Multiple send failures - reconnecting WiFi...")
                            connect_wifi()
                            consecutive_errors = 0
            
            time.sleep(0.1)
            
        except KeyboardInterrupt:
            print("\n🛑 Stopping WaterSaver monitor...")
            break
            
        except Exception as e:
            print(f"❌ Main loop error: {e}")
            time.sleep(5)  

if __name__ == "__main__":
    main()

