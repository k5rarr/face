const STORAGE_KEYS = {
  employees: "facetrack_employees",
  logs: "facetrack_logs",
};

const FACE_MATCH_THRESHOLD = 0.5;

const video = document.getElementById("video");
const uploadedPreview = document.getElementById("uploadedPreview");
const imageUpload = document.getElementById("imageUpload");
const sourceMode = document.getElementById("sourceMode");
const uploadLabel = document.getElementById("uploadLabel");
const cameraPanel = document.getElementById("cameraPanel");
const uploadPanel = document.getElementById("uploadPanel");

const statusText = document.getElementById("status");
const enrollForm = document.getElementById("enrollForm");
const employeeTable = document.getElementById("employeeTable");
const logTable = document.getElementById("logTable");
const checkInBtn = document.getElementById("checkInBtn");
const checkOutBtn = document.getElementById("checkOutBtn");
const clearLogsBtn = document.getElementById("clearLogsBtn");

let employees = loadFromStorage(STORAGE_KEYS.employees, []);
let logs = loadFromStorage(STORAGE_KEYS.logs, []);
let modelsReady = false;
let webcamReady = false;
let uploadedImage = null;

init();

async function init() {
  renderEmployees();
  renderLogs();
  attachEvents();

  try {
    await loadModels();
    modelsReady = true;
    setStatus("Models loaded. Select source mode and proceed.");
  } catch (error) {
    console.error(error);
    setStatus(`Model load error: ${error.message}`);
  }

  await enableCamera();
}

function attachEvents() {
  sourceMode.addEventListener("change", handleSourceModeChange);

  imageUpload.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      uploadedImage = null;
      uploadedPreview.removeAttribute("src");
      return;
    }

    uploadedImage = await fileToImage(file);
    uploadedPreview.src = uploadedImage.src;
    setStatus("Image loaded. You can now enroll or mark attendance using upload mode.");
  });

  enrollForm.addEventListener("submit", handleEnrollment);
  checkInBtn.addEventListener("click", () => registerAttendance("Check In"));
  checkOutBtn.addEventListener("click", () => registerAttendance("Check Out"));
  clearLogsBtn.addEventListener("click", clearLogs);
}

async function loadModels() {
  const MODEL_URL =
    "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";

  setStatus("Loading face recognition models…");
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
}

async function enableCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: 720 },
      audio: false,
    });

    video.srcObject = stream;
    await new Promise((resolve) => {
      video.onloadedmetadata = () => resolve();
    });

    webcamReady = true;
    if (sourceMode.value === "camera") {
      setStatus("Webcam ready. Position one face clearly in frame.");
    }
  } catch (error) {
    webcamReady = false;
    sourceMode.value = "upload";
    handleSourceModeChange();
    setStatus(
      "Webcam unavailable in this environment. Switched to Photo Upload mode automatically."
    );
  }
}

function handleSourceModeChange() {
  const usingUpload = sourceMode.value === "upload";
  uploadLabel.classList.toggle("hidden", !usingUpload);
  uploadPanel.classList.toggle("hidden", !usingUpload);
  cameraPanel.classList.toggle("hidden", usingUpload);

  if (!usingUpload && !webcamReady) {
    setStatus("Webcam is not available. Please use Photo Upload mode.");
    sourceMode.value = "upload";
    handleSourceModeChange();
    return;
  }

  if (usingUpload) {
    setStatus("Upload mode active. Choose a face photo to continue.");
  } else {
    setStatus("Camera mode active. Position one face clearly in frame.");
  }
}

async function handleEnrollment(event) {
  event.preventDefault();

  if (!modelsReady) {
    setStatus("Please wait for model loading to complete.");
    return;
  }

  const id = document.getElementById("employeeId").value.trim();
  const name = document.getElementById("employeeName").value.trim();

  if (!id || !name) {
    setStatus("Employee ID and name are required.");
    return;
  }

  if (employees.some((emp) => emp.id.toLowerCase() === id.toLowerCase())) {
    setStatus("Employee ID already exists.");
    return;
  }

  const descriptor = await getFaceDescriptor();
  if (!descriptor) {
    return;
  }

  employees.push({
    id,
    name,
    descriptor: Array.from(descriptor),
    lastSeen: new Date().toISOString(),
  });
  saveToStorage(STORAGE_KEYS.employees, employees);

  renderEmployees();
  enrollForm.reset();
  setStatus(`Employee ${name} (${id}) registered successfully.`);
}

async function registerAttendance(action) {
  if (!modelsReady) {
    setStatus("Please wait for model loading to complete.");
    return;
  }

  if (!employees.length) {
    setStatus("No employees registered yet.");
    return;
  }

  const descriptor = await getFaceDescriptor();
  if (!descriptor) {
    return;
  }

  const match = findBestMatch(descriptor);
  if (!match) {
    setStatus("Face not recognized. Try again with a clearer face image.");
    return;
  }

  const now = new Date().toISOString();
  const record = {
    timestamp: now,
    employeeId: match.employee.id,
    employeeName: match.employee.name,
    action,
    distance: match.distance.toFixed(3),
  };

  logs.unshift(record);
  saveToStorage(STORAGE_KEYS.logs, logs);

  const employee = employees.find((emp) => emp.id === match.employee.id);
  if (employee) {
    employee.lastSeen = now;
    saveToStorage(STORAGE_KEYS.employees, employees);
  }

  renderEmployees();
  renderLogs();
  setStatus(
    `${match.employee.name} (${match.employee.id}) ${action.toLowerCase()} recorded (distance ${record.distance}).`
  );
}

function clearLogs() {
  logs = [];
  saveToStorage(STORAGE_KEYS.logs, logs);
  renderLogs();
  setStatus("Attendance logs cleared.");
}

async function getFaceDescriptor() {
  const source = getDetectionSource();
  if (!source) {
    return null;
  }

  setStatus("Analyzing face… keep still.");

  const detection = await faceapi
    .detectSingleFace(source, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    setStatus("No face detected. Ensure one clear face is visible.");
    return null;
  }

  return detection.descriptor;
}

function getDetectionSource() {
  if (sourceMode.value === "camera") {
    if (!webcamReady) {
      setStatus("Webcam is not ready. Switch to Photo Upload mode.");
      return null;
    }
    return video;
  }

  if (!uploadedImage) {
    setStatus("Please upload an image first.");
    return null;
  }

  return uploadedImage;
}

function findBestMatch(currentDescriptor) {
  let bestEmployee = null;
  let lowestDistance = Number.POSITIVE_INFINITY;

  for (const employee of employees) {
    const known = new Float32Array(employee.descriptor);
    const distance = faceapi.euclideanDistance(currentDescriptor, known);

    if (distance < lowestDistance) {
      lowestDistance = distance;
      bestEmployee = employee;
    }
  }

  if (!bestEmployee || lowestDistance > FACE_MATCH_THRESHOLD) {
    return null;
  }

  return { employee: bestEmployee, distance: lowestDistance };
}

function renderEmployees() {
  employeeTable.innerHTML = "";

  if (!employees.length) {
    employeeTable.innerHTML = `<tr><td colspan="3">No employees registered.</td></tr>`;
    return;
  }

  for (const employee of employees) {
    const row = document.createElement("tr");
    const lastSeen = employee.lastSeen ? new Date(employee.lastSeen).toLocaleString() : "-";
    row.innerHTML = `<td>${employee.id}</td><td>${employee.name}</td><td>${lastSeen}</td>`;
    employeeTable.appendChild(row);
  }
}

function renderLogs() {
  logTable.innerHTML = "";

  if (!logs.length) {
    logTable.innerHTML = `<tr><td colspan="5">No attendance records yet.</td></tr>`;
    return;
  }

  for (const record of logs) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${new Date(record.timestamp).toLocaleString()}</td>
      <td>${record.employeeId}</td>
      <td>${record.employeeName}</td>
      <td>${record.action}</td>
      <td>${record.distance ?? "-"}</td>
    `;
    logTable.appendChild(row);
  }
}

function setStatus(message) {
  statusText.textContent = message;
}

function loadFromStorage(key, fallback) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}

function saveToStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not load uploaded image."));
      image.src = reader.result;
    };

    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}
