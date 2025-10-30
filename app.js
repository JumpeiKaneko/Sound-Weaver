// =========================================================================
// DOM要素の取得 (変更なし)
// =========================================================================
const mainContainer = document.querySelector('.container'); 
const volumeBar = document.getElementById('volumeBar');
const authArea = document.getElementById('auth-area');
const calibrationArea = document.getElementById('calibration-area');
const executionArea = document.getElementById('main-execution-area');
const loginButton = document.getElementById('loginButton');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const authMessage = document.getElementById('authMessage');
const displayUsername = document.getElementById('displayUsername');
const execUsername = document.getElementById('execUsername');
const instructionBox = document.getElementById('initialInstruction');
const instructionPrompt = document.querySelector('.instruction-prompt');
const recIndicator = document.getElementById('recIndicator'); 
const smallStatus = document.getElementById('smallStatus'); 

// =========================================================================
// グローバル変数 (変更なし)
// =========================================================================
let audioContext;
let analyser;
let dataArray;
let isMicActive = false;
let animationFrameId;
let currentProfile = []; 
// ★ 拡張された音楽スケール（乖離度に応じて選択）
const scales = {
    calm: ["C4", "Eb4", "G4", "Bb4", "C5", "G3"],           // 基本ペンタトニック
    medium: ["C4", "D4", "Eb4", "F4", "G4", "Ab4", "Bb4", "C5"], // ナチュラルマイナー
    intense: ["C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4", "C5"] // クロマチック
};
let currentScale = scales.calm; // デフォルトスケール
let collectStep = 0; 
let sequencer; 
let currentUsername = null; 
let sourceNode = null; 

// ★ 新規: エフェクトとシンセをグローバルに追加
let reverb;
let synth;

// ★ パフォーマンス最適化用変数
let normalizedScore = 0;  // グローバルスコアキャッシュ
let lastAnalysisTime = 0;  // 分析時間の最適化
const ANALYSIS_INTERVAL = 16; // 60FPS相当（16ms）

// =========================================================================
// イベントリスナー (変更なし)
// =========================================================================
loginButton.addEventListener('click', handleAuthentication);
mainContainer.addEventListener('click', handleContainerClick);


// --- 認証とフェーズ制御関数 ---
function handleAuthentication() {
    const name = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (name.length < 1 || password.length < 1) {
        authMessage.textContent = "ユーザーネームとパスワードを入力してください。";
        return;
    }

    try {
        const userData = localStorage.getItem(`sw_user_${name}`);
        
        if (userData) {
            const parsedData = JSON.parse(userData);
            if (parsedData.password === password) {
                currentUsername = name;
                currentProfile = parsedData.profile || [];
                collectStep = currentProfile.length;
                
                authMessage.textContent = `Welcome back, ${name}.`;
                setTimeout(startNextPhase, 1000); 
            } else {
                authMessage.textContent = "パスワードが違います。";
            }
        } else {
            localStorage.setItem(`sw_user_${name}`, JSON.stringify({ password: password, profile: [] }));
            currentUsername = name;
            authMessage.textContent = `Welcome, ${name}. 初期設定を開始します。`;
            setTimeout(startNextPhase, 1000);
        }
    } catch (error) {
        console.error('認証エラー:', error);
        authMessage.textContent = "認証エラーが発生しました。";
    }
}

function saveProfileToLocalStorage() {
    if (currentUsername) {
        try {
            const password = passwordInput.value.trim();
            const userData = { password: password, profile: currentProfile };
            localStorage.setItem(`sw_user_${currentUsername}`, JSON.stringify(userData));
        } catch (error) {
            console.error('データ保存エラー:', error);
            smallStatus.textContent = "保存エラーが発生しました。";
        }
    }
}

function startNextPhase() {
    if (currentProfile.length < 3) {
        startCalibrationPhase();
    } else {
        startExecutionPhase();
    }
}

function startCalibrationPhase() {
    authArea.classList.add('hidden');
    calibrationArea.classList.remove('hidden');
    displayUsername.textContent = currentUsername;
    smallStatus.textContent = 'クリックして開始';
    
    setTimeout(() => {
        instructionPrompt.textContent = currentProfile.length === 0
            ? '画面をクリックして、最初の音の収集を開始してください。'
            : `記憶 (${currentProfile.length + 1}/3) を開始するにはクリック。`;
        instructionBox.classList.add('visible');
    }, 100);
}

function startExecutionPhase() {
    authArea.classList.add('hidden');
    calibrationArea.classList.add('hidden');
    executionArea.classList.remove('hidden');
    execUsername.textContent = currentUsername;
    smallStatus.textContent = '分析開始。クリックで停止します。';
    smallStatus.classList.add('active');
    
    startMicInput(false);
}

function handleContainerClick() {
    if (!authArea.classList.contains('hidden')) return; 

    if (currentProfile.length < 3) {
        startMicInput(true);
        instructionBox.classList.remove('visible');
    } else {
        startMicInput(false);
    }
}

function analyzeAndSaveProfile() {
    try {
        const profileData = Array.from(dataArray); 
        let sum = 0;
        for (let i = 0; i < profileData.length; i++) { sum += profileData[i]; }
        const averagePeak = sum / profileData.length;
        const normalizedAverage = averagePeak / 255; 
        
        currentProfile.push({ 
            data: profileData, 
            averageVolume: normalizedAverage,
            timestamp: Date.now()
        });
        collectStep++;
        
        saveProfileToLocalStorage();
        
        if (collectStep < 3) {
            instructionPrompt.textContent = `記憶 (${currentProfile.length + 1}/3) を開始するにはクリック。`;
            instructionBox.classList.add('visible');
            smallStatus.textContent = `✅ 記憶 ${currentProfile.length} 回完了`;
        } else {
            startExecutionPhase();
        }
    } catch (error) {
        console.error('プロファイル分析エラー:', error);
        smallStatus.textContent = "分析エラーが発生しました。";
    }
}

function stopMicInput() {
    if (isMicActive) {
        try {
            cancelAnimationFrame(animationFrameId);
            
            if (sourceNode) {
                sourceNode.disconnect();
                sourceNode = null;
            }

            if (audioContext && audioContext.state !== 'closed') {
                audioContext.close().catch(e => console.warn('AudioContext終了エラー:', e));
            }

            isMicActive = false;
            recIndicator.classList.add('hidden');
            smallStatus.classList.remove('active');
        } catch (error) {
            console.error('マイク停止エラー:', error);
        }
    }
}

function drawAnalysis() {
    if (!isMicActive || !analyser) return;

    try {
        analyser.getByteFrequencyData(dataArray);

        let maxPeak = 0;
        for (let i = 0; i < dataArray.length; i++) { 
            maxPeak = Math.max(maxPeak, dataArray[i]); 
        }
        const normalizedPeak = maxPeak / 255;
        
        const sensitivity = 100;
        const barWidth = Math.min(normalizedPeak * sensitivity, 100);
        volumeBar.style.width = `${barWidth}%`;
        
        volumeBar.classList.remove('divergence-light', 'divergence-medium', 'divergence-high', 'divergence-intense');
        
        aiCompositionLogic(normalizedPeak);

        animationFrameId = requestAnimationFrame(drawAnalysis);
    } catch (error) {
        console.error('分析エラー:', error);
        stopMicInput();
    }
}


// =========================================================================
// ★ 音楽表現の洗練（AI作曲に凝る）
// =========================================================================

function initializeSynth() {
    if (typeof Tone === 'undefined') { smallStatus.textContent = "エラー: Tone.jsを読み込んでください。"; return; }
    try {
        // 1. リバーブ（残響）の初期化: 表現力と深みを与える
        reverb = new Tone.Reverb({
            decay: 5, // 長めの残響
            preDelay: 0.01,
            wet: 0.1 // 初期は薄く
        }).toDestination();

        // 2. DuoSynthの初期化: 豊かな音色と表現力
        synth = new Tone.DuoSynth({
            vibratoAmount: 0.5,
            vibratoRate: 5,
            harmonicity: 1.5,
            voice0: {
                volume: -10,
                portamento: 0,
                oscillator: { type: "sawtooth" }, // ノコギリ波
                filter: { type: "lowpass", frequency: 1000 },
                envelope: { attack: 2, decay: 1, sustain: 0.5, release: 2 } // 浮遊感のある設定
            },
            voice1: {
                volume: -15,
                portamento: 0,
                oscillator: { type: "sine" }, // サイン波
                filter: { type: "lowpass", frequency: 800 },
                envelope: { attack: 2.5, decay: 0.5, sustain: 0.5, release: 3 }
            }
        }).connect(reverb); // リバーブに接続

        // 3. ★ 改善されたシーケンサー（動的スケール対応）
        sequencer = new Tone.Sequence((time, note) => {
            if (isMicActive && Tone.Transport.bpm.value > 60.1) {
                const randomNoteIndex = Math.floor(Math.random() * currentScale.length);
                const currentNote = currentScale[randomNoteIndex];
                
                // ★ 乖離度に応じた音の長さとボリューム
                const noteDuration = normalizedScore > 0.5 ? "8n" : "2n";
                const velocity = Math.min(0.3 + (normalizedScore * 0.4), 0.8);
                
                synth.triggerAttackRelease(currentNote, noteDuration, time, velocity);
            }
        }, currentScale, "2n").start(0);

        Tone.Transport.start();
        Tone.Transport.bpm.value = 60; // 基本BPMを遅くする
    } catch (e) { 
        smallStatus.textContent = "エラー: シンセ初期化失敗";
    }
}


function aiCompositionLogic(currentVolume) {
    if (!synth || currentProfile.length === 0 || !sequencer || !reverb) return;

    // ★ パフォーマンス最適化: 分析頻度を制限
    const currentTime = performance.now();
    if (currentTime - lastAnalysisTime < ANALYSIS_INTERVAL) return;
    lastAnalysisTime = currentTime;

    // ----------------------------------------------------
    // 1. ★ 最適化された乖離スコアの計算
    // ----------------------------------------------------
    let totalScore = 0;
    const profileCount = currentProfile.length;
    
    // ★ 効率的なループとキャッシング
    for (let p = 0; p < profileCount; p++) {
        const profileData = currentProfile[p].data;
        let sumOfSquaredDifferences = 0;
        
        // ★ 計算量削減: サンプリング間隔を調整
        for (let i = 0; i < dataArray.length; i += 2) {
            const diff = dataArray[i] - profileData[i];
            sumOfSquaredDifferences += diff * diff;
        }
        
        totalScore += Math.sqrt(sumOfSquaredDifferences / (dataArray.length / 2));
    }
    
    const averageRmsDifference = totalScore / profileCount;
    normalizedScore = Math.min(averageRmsDifference / 100, 1); 
    const scoreThreshold = 0.2; 

    const statusArea = document.querySelector('.container');
    statusArea.classList.remove('glitch-active', 'glitch-light', 'glitch-medium', 'glitch-intense');

    // ----------------------------------------------------
    // 2. AI作曲ロジック：スコアに基づく音楽表現への応用
    // ----------------------------------------------------

    if (normalizedScore > scoreThreshold) {
        
        // 乖離（独自性）が高いときの表現
        
        // ★ BPMの高速化とフィルターの開放
        const newBPM = 60 + (normalizedScore * 140); // 60から200まで加速
        Tone.Transport.bpm.value = newBPM;

        // ★ 乖離度に応じたスケール選択
        if (normalizedScore >= 0.7) {
            currentScale = scales.intense;  // 高乖離時はクロマチック
        } else if (normalizedScore >= 0.4) {
            currentScale = scales.medium;   // 中乖離時はマイナースケール
        } else {
            currentScale = scales.calm;     // 低乖離時はペンタトニック
        }

        // ★ リバーブのウェット（深さ）を強調
        reverb.wet.value = Math.min(0.1 + normalizedScore * 0.5, 0.7);

        // ★ フィルターを乖離度に合わせて開放（音色を明るく、鋭く）
        const filterFreq = 1000 + normalizedScore * 3000;
        if (synth.voice0 && synth.voice0.filter) {
            synth.voice0.filter.frequency.value = filterFreq;
            synth.voice1.filter.frequency.value = filterFreq * 0.8;
        }
        
        // UIフィードバック
        if (normalizedScore >= 0.5) {
            statusArea.classList.add('glitch-active');
            volumeBar.classList.add('divergence-high');
        } else {
            statusArea.classList.add('glitch-light');
            volumeBar.classList.add('divergence-medium');
        }
        
        smallStatus.textContent = `固有性からの乖離: ${normalizedScore.toFixed(3)}`;

    } else {
        
        // 固有性が維持されているときの表現
        Tone.Transport.bpm.value = 60; // 低速・安定
        reverb.wet.value = 0.1; // リバーブを最小限に

        // フィルターを閉じ、音色を暗く、穏やかにする
        synth.voice0.filterEnvelope.baseFrequency = 1000;
        synth.voice1.filterEnvelope.baseFrequency = 800;
        
        statusArea.classList.remove('glitch-active', 'glitch-light');
        volumeBar.classList.remove('divergence-light', 'divergence-medium', 'divergence-high', 'divergence-intense');

        smallStatus.textContent = `サウンドスケープを維持中`;
    }
}

// --- ★ 改善されたマイク入力ロジック（エラーハンドリング強化） ---
async function startMicInput(isCollecting) {
    if (isMicActive) {
        stopMicInput();
        if (currentProfile.length >= 3) {
            smallStatus.textContent = '停止中。再開するにはクリック。';
            smallStatus.classList.remove('active');
        } else {
            smallStatus.textContent = `停止中... 記憶 (${currentProfile.length}/3)`;
            instructionBox.classList.add('visible');
        }
        return;
    }

    try {
        // AudioContext の安全な初期化
        if (!audioContext || audioContext.state === 'closed') {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            
            initializeSynth();
        }
        
        // 高品質なマイクアクセス設定
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
                echoCancellation: true, 
                noiseSuppression: true, 
                autoGainControl: true,
                sampleRate: 44100,
                channelCount: 1
            }
        });
        
        if (!stream.active) {
            throw new Error('ストリームが非アクティブです');
        }
        
        sourceNode = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        
        // ★ 改善されたAnalyser設定
        analyser.fftSize = 512;  // より高精度な分析
        analyser.minDecibels = -90;
        analyser.maxDecibels = -10;
        analyser.smoothingTimeConstant = 0.8;  // より安定した分析
        
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        sourceNode.connect(analyser);
        
        isMicActive = true;
        smallStatus.classList.add('active');

        if (isCollecting) {
            if (currentProfile.length >= 3) return; 
            
            try {
                // ★ フィードバック防止の改善
                const gainNode = audioContext.createGain();
                gainNode.gain.value = 0.3;  // 音量を抑制
                sourceNode.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                recIndicator.classList.remove('hidden'); 
            } catch (e) {
                console.warn('フィードバック接続をスキップ:', e);
            }
            
            smallStatus.textContent = `収集中 (${currentProfile.length + 1}/3)... 30秒間音を鳴らしてください。`;
            setTimeout(() => {
                stopMicInput();
                analyzeAndSaveProfile(); 
            }, 30000); 
        } else {
            recIndicator.classList.add('hidden');
            smallStatus.textContent = `分析中...`;
        }
        
        drawAnalysis();

    } catch (err) {
        console.error('マイク入力エラー:', err);
        
        // ★ 詳細なエラーハンドリング
        let errorMessage = 'マイクエラー: ';
        
        switch (err.name) {
            case 'NotAllowedError':
                errorMessage += 'アクセス拒否。設定を確認してください。';
                break;
            case 'NotFoundError':
                errorMessage += 'マイクが見つかりません。';
                break;
            case 'NotSupportedError':
                errorMessage += 'ブラウザが非対応です。';
                break;
            case 'SecurityError':
                errorMessage += 'HTTPSで接続してください。';
                break;
            case 'AbortError':
                errorMessage += '操作が中断されました。';
                break;
            default:
                errorMessage += err.message || '不明なエラー';
        }
        
        smallStatus.textContent = errorMessage;
        
        // エラー時のクリーンアップ
        isMicActive = false;
        recIndicator.classList.add('hidden');
        smallStatus.classList.remove('active');
        
        // 3秒後に状態をリセット
        setTimeout(() => {
            smallStatus.textContent = 'クリックして再試行';
        }, 3000);
    }
}

// ... (残りの関数は変更なし) ...


