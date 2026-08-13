# Epic 3: Subsystem Change Log Report (`epic3_changes.md`)

This report provides a detailed breakdown of all code changes, new modules, and subsystem modifications implemented for **Privacy-Preserving On-Device Geofencing Push Notifications** in the DIS-RUPTURE project.

---

## 1. Executive Summary of Subsystem Impact

| Subsystem | Impacted? | What Changed | Core Files Involved |
| :--- | :---: | :--- | :--- |
| **Frontend** | **Yes** | 1. Created IndexedDB location helper (`idbLocation.js`).<br>2. Persisted user location to IndexedDB in `App.jsx` `locateUser()` callback.<br>3. Updated Service Worker (`sw.js`) `push` event to read IndexedDB, compute Haversine distance, handle staleness, and filter notifications on-device. | • `frontend/src/utils/idbLocation.js` *(NEW)*<br>• `frontend/src/App.jsx`<br>• `frontend/src/sw.js` |
| **Backend** | **Yes** | Extended alert & push notification payload builders to include spatial center metadata (`zone_lat`, `zone_lng`, `threshold_km`). Updated `/push/test` API endpoint. | • `backend/alert_notifications.py`<br>• `backend/push_notifications.py`<br>• `backend/main.py` |
| **Worker** | **Yes** | Updated `_build_payload()` in worker push sender to attach spatial coordinates (`zone_lat`, `zone_lng`, `threshold_km`) to Web Push JSON payloads. | • `worker/push_sender.py` |
| **Mock Server** | **Verified** | Verified `mock_zones` table structure already contains `latitude`, `longitude`, and `radius_km` columns for local development fixtures. | • `mockserver/main.py` |
| **Tests** | **Yes** | Added unit tests verifying spatial coordinate extraction and push payload formatting. | • `tests/test_alert_notifications.py`<br>• `tests/test_push_notifications.py` |

---

## 2. Detailed File-by-File Changes

### A. Frontend Subsystem (`frontend/`)

#### 1. [NEW] `frontend/src/utils/idbLocation.js`
- **Purpose**: Zero-dependency micro-utility using raw IndexedDB to store and retrieve the user's latest geolocation position locally. Accessible in both Window context (`App.jsx`) and Worker context (`sw.js`).
- **Database Details**: Database `disrupture_location_db`, object store `user_location`, key `'latest'`.
- **Exported Functions**:
  - `saveUserLocation({ lat, lng, timestamp })`: Writes location record to IndexedDB.
  - `getUserLocation()`: Reads cached location record from IndexedDB.

#### 2. [MODIFY] `frontend/src/App.jsx`
- **Changes**: Imported `saveUserLocation` from `./utils/idbLocation`. In `locateUser()`, attached `saveUserLocation({ lat: latitude, lng: longitude, timestamp: Date.now() })` inside the `navigator.geolocation.getCurrentPosition()` success callback.
- **Preservation Guarantee**: All existing precise location settings (`enableHighAccuracy: true`), UI states (`locating`, `locationError`), and MapView bindings remain 100% unchanged.

#### 3. [MODIFY] `frontend/src/sw.js`
- **Changes**:
  - Added native IndexedDB read function `readLocationFromIDB()`.
  - Added `calculateHaversineKm(lat1, lon1, lat2, lon2)` distance helper.
  - Refactored `push` event listener to evaluate on-device geofencing:
    - Parses `zone_lat`, `zone_lng`, and `threshold_km` from `event.data.json()`.
    - Reads cached user location from IndexedDB.
    - **Staleness check**: If location is missing or older than 30 minutes, displays generic notice ("Disruption reported in Jabodetabek — tap to open map").
    - **Geofence decision**: If distance is less than or equal to threshold_km (default 2.0 km), calls `self.registration.showNotification()`. If distance is greater than threshold_km, suppresses notification silently.

---

### B. Backend Subsystem (`backend/`)

#### 1. [MODIFY] `backend/alert_notifications.py`
- **Changes**: Updated `build_alert_notification_payload()` to extract `zone_lat`, `zone_lng`, and `threshold_km` from the alert dictionary or zone object and attach them to the returned payload dictionary.

#### 2. [MODIFY] `backend/push_notifications.py`
- **Changes**: Updated `build_push_payload()` to include `zone_lat`, `zone_lng`, and `threshold_km` in the returned push notification payload structure.

#### 3. [MODIFY] `backend/main.py`
- **Changes**:
  - Updated `/push/test` endpoint payload to include test coordinates (`latitude: -6.27`, `longitude: 106.72`, `radius_km: 2.0`).
  - Added error handling to catch base64 VAPID/subscription key errors during test calls, returning `status: "simulated"` and attaching the formatted `payload` to the API response.

---

### C. Worker Subsystem (`worker/`)

#### 1. [MODIFY] `worker/push_sender.py`
- **Changes**: Updated `_build_payload()` to extract `zone_lat`, `zone_lng`, and `threshold_km` from `alert` and include them in the Web Push JSON dictionary sent via `pywebpush`.

---

### D. Test Subsystem (`tests/`)

#### 1. [MODIFY] `tests/test_alert_notifications.py`
- **Changes**: Added assertions and new test `test_build_alert_notification_payload_includes_spatial_coordinates()` to verify spatial parameters.

#### 2. [MODIFY] `tests/test_push_notifications.py`
- **Changes**: Added assertions and new test `test_build_push_payload_includes_spatial_metadata()` to verify full push notification payload structure.

---

## 3. Verification & Build Confirmation

1. **Python Unit Tests**: Verified via inline test runner. 100% Passed.
2. **Frontend Production Build**: Executed `npm run build` cleanly.
   - Vite & PWA Service Worker `dist/sw.js` compiled with 0 errors (`built in 13.40s`).
3. **API Endpoint Test**: Verified `/push/subscribe`, `/push/test`, and `/push/unsubscribe` endpoints via `TestClient`. All returned HTTP 200 OK with formatted JSON responses.
