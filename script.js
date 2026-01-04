import { GoogleGenerativeAI } from "@google/generative-ai";

// DOM Elements
const elements = {
    apiKeyInput: document.getElementById('api-key'),
    toggleKeyBtn: document.getElementById('toggle-key'),
    fileInput: document.getElementById('file-upload'),
    mediaPlayer: document.getElementById('media-player'),
    generateBtn: document.getElementById('generate-btn'),
    downloadBtn: document.getElementById('download-btn'),
    editorList: document.getElementById('editor-list'),
    mascot: document.getElementById('mascot-container'),
    loading: document.getElementById('loading-overlay'),
    statusMsg: document.getElementById('status-msg'),
    fileNameDisplay: document.getElementById('file-name-display'),

    // Tutorial Modal Elements
    helpBtn: document.getElementById('help-btn'),
    modal: document.getElementById('tutorial-modal'),
    closeModal: document.querySelector('.close-modal')
};

// State
let state = {
    subtitles: [], // { id, start, end, text }
    file: null,
    apiKey: localStorage.getItem('gemini_api_key') || ''
};

// Initialize
if (state.apiKey) {
    elements.apiKeyInput.value = state.apiKey;
}

// --- Event Listeners ---

// API Key Toggle
elements.toggleKeyBtn.addEventListener('click', () => {
    const type = elements.apiKeyInput.type === 'password' ? 'text' : 'password';
    elements.apiKeyInput.type = type;

    // Toggle Font Awesome Icon
    const icon = elements.toggleKeyBtn.querySelector('i');
    if (type === 'password') {
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    } else {
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    }
});

// Tutorial Modal Handlers
elements.helpBtn.addEventListener('click', () => {
    elements.modal.classList.add('active');
});

elements.closeModal.addEventListener('click', () => {
    elements.modal.classList.remove('active');
});

window.addEventListener('click', (event) => {
    if (event.target === elements.modal) {
        elements.modal.classList.remove('active');
    }
});

// API Key Save
elements.apiKeyInput.addEventListener('input', (e) => {
    state.apiKey = e.target.value;
    localStorage.setItem('gemini_api_key', state.apiKey);
});

// File Upload
elements.fileInput.addEventListener('change', handleFileUpload);
elements.generateBtn.addEventListener('click', generateSubtitles);
elements.downloadBtn.addEventListener('click', downloadSRT);
elements.mediaPlayer.addEventListener('timeupdate', syncSubtitles);

// Mascot Drag
setupDraggable(elements.mascot);

// --- Functions ---

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    state.file = file;
    const url = URL.createObjectURL(file);
    elements.mediaPlayer.src = url;
    elements.generateBtn.disabled = false;
    elements.fileNameDisplay.innerText = `目前檔案: ${file.name}`;
    elements.statusMsg.innerText = "已載入";
}

async function generateSubtitles() {
    if (!state.apiKey) {
        alert("請輸入 Gemini API Key");
        return;
    }
    if (!state.file) {
        alert("請選擇檔案");
        return;
    }

    setLoading(true);
    try {
        const genAI = new GoogleGenerativeAI(state.apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // Read file as Base64 (Client-side limit applies)
        // Note: For large files, this might crash browser. Ideally, we use the File API manager, 
        // but that requires server-side token generation usually.
        // For this demo, we assume the user uploads reasonable sized clips.
        const base64Data = await fileToGenerativePart(state.file);

        const prompt = `
      You are an expert subtitle generator. 
      Please listen to the attached audio/video file and transcribe it into pure SRT format.
      Return ONLY the SRT content. No markdown code blocks, no explanation.
      Language: Traditional Chinese (or detected language if mixed, but prefer Traditional Chinese for output).
      Ensure strict SRT formatting.
    `;

        const result = await model.generateContent([prompt, base64Data]);
        const response = await result.response;
        const text = response.text();

        parseSRT(text);
        renderEditor();
        elements.downloadBtn.disabled = false;
        elements.statusMsg.innerText = "字幕生成完畢！";

    } catch (error) {
        console.error(error);
        alert("生成失敗: " + error.message);
        elements.statusMsg.innerText = "發生錯誤";
    } finally {
        setLoading(false);
    }
}

// Convert File to Base64/Part for Gemini
async function fileToGenerativePart(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Data = reader.result.split(',')[1];
            resolve({
                inlineData: {
                    data: base64Data,
                    mimeType: file.type
                },
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// SRT Parser
function parseSRT(srtText) {
    // Clean up markdown blocks if any
    srtText = srtText.replace(/```srt/g, '').replace(/```/g, '').trim();

    const blocks = srtText.split(/\n\s*\n/);
    state.subtitles = blocks.map(block => {
        const lines = block.split('\n');
        if (lines.length < 3) return null;

        const id = lines[0];
        const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);
        if (!timeMatch) return null;

        const text = lines.slice(2).join('\n'); // multi-line text

        return {
            id,
            start: timeStringToSeconds(timeMatch[1]),
            end: timeStringToSeconds(timeMatch[2]),
            originalTime: lines[1], // keep raw string for exact export if untouched
            text
        };
    }).filter(item => item !== null);
}

// Time Helper
function timeStringToSeconds(timeString) {
    const [h, m, s] = timeString.split(':');
    const [sec, ms] = s.split(',');
    return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(sec) + parseInt(ms) / 1000;
}

function secondsToTimeString(seconds) {
    const date = new Date(0);
    date.setMilliseconds(seconds * 1000); // This works for < 24h
    // Format: HH:MM:SS,mmm
    const times = date.toISOString().substr(11, 12).replace('.', ',');
    return times;
}

// Render Editor
function renderEditor() {
    elements.editorList.innerHTML = '';
    state.subtitles.forEach((sub, index) => {
        const div = document.createElement('div');
        div.className = 'subtitle-item';
        div.id = `sub-${index}`;
        div.innerHTML = `
      <div class="time-inputs">
        <button class="time-input" data-idx="${index}" data-type="start">${secondsToTimeString(sub.start).split(',')[0]}</button>
        <button class="time-input" data-idx="${index}" data-type="end">${secondsToTimeString(sub.end).split(',')[0]}</button>
      </div>
      <textarea class="text-input" data-idx="${index}">${sub.text}</textarea>
    `;

        // Jump to time on click
        div.querySelector('.time-inputs').addEventListener('click', () => {
            elements.mediaPlayer.currentTime = sub.start;
        });

        // Update text listener
        div.querySelector('textarea').addEventListener('input', (e) => {
            state.subtitles[index].text = e.target.value;
        });

        elements.editorList.appendChild(div);
    });
}

// Sync Player with Editor
function syncSubtitles() {
    const t = elements.mediaPlayer.currentTime;
    const activeIdx = state.subtitles.findIndex(s => t >= s.start && t <= s.end);

    // Clear previous
    document.querySelectorAll('.subtitle-item.active').forEach(el => el.classList.remove('active'));

    if (activeIdx !== -1) {
        const el = document.getElementById(`sub-${activeIdx}`);
        if (el) {
            el.classList.add('active');
            // Smooth scroll to element
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

// Download SRT
function downloadSRT() {
    if (state.subtitles.length === 0) return;

    let content = '';
    state.subtitles.forEach((sub, i) => {
        // Reconstruct valid SRT
        // Use stored start/end times converted back to string
        const startStr = secondsToTimeString(sub.start);
        const endStr = secondsToTimeString(sub.end);

        content += `${i + 1}\n${startStr} --> ${endStr}\n${sub.text}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subtitle_${Date.now()}.srt`;
    a.click();
    URL.revokeObjectURL(url);
}

// Loading Overlay
function setLoading(isLoad) {
    if (isLoad) elements.loading.classList.add('active');
    else elements.loading.classList.remove('active');
}

// Draggable Mascot
function setupDraggable(el) {
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    el.addEventListener("mousedown", dragStart);
    document.addEventListener("mouseup", dragEnd);
    document.addEventListener("mousemove", drag);

    // Touch support
    el.addEventListener("touchstart", dragStart);
    document.addEventListener("touchend", dragEnd);
    document.addEventListener("touchmove", drag);

    function dragStart(e) {
        if (e.type === "touchstart") {
            initialX = e.touches[0].clientX - xOffset;
            initialY = e.touches[0].clientY - yOffset;
        } else {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
        }

        if (e.target === el || el.contains(e.target)) {
            isDragging = true;
        }
    }

    function dragEnd(e) {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();

            if (e.type === "touchmove") {
                currentX = e.touches[0].clientX - initialX;
                currentY = e.touches[0].clientY - initialY;
            } else {
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
            }

            xOffset = currentX;
            yOffset = currentY;

            setTranslate(currentX, currentY, el);
        }
    }

    function setTranslate(xPos, yPos, el) {
        el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
    }
}
