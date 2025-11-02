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
// グローバル変数
// =========================================================================
let audioContext;
let analyser;
let dataArray;
let isMicActive = false;
let animationFrameId;
let currentProfile = []; 
let collectStep = 0; 
let currentUsername = null; 
let sourceNode = null; 

// ★ Webソケット関連の追加
let ws = null; // WebSocket接続
const WS_URL = 'ws://localhost:8080'; // MAX/MSPが待ち受けるアドレス (必要に応じて変更)

// ★ パフォーマンス最適化用変数
let normalizedScore = 0;  // グローバルスコアキャッシュ
let lastAnalysisTime = 0;  // 分析時間の最適化
const ANALYSIS_INTERVAL = 50; // データ送信頻度を制限 (20FPS相当)

// =========================================================================
// イベントリスナー (変更なし)
// =========================================================================
loginButton.addEventListener('click', handleAuthentication);
mainContainer.addEventListener('click', handleContainerClick);


// --- 認証とフェーズ制御関数 (ロジック維持) ---

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
                // マイク入力の接続を全て切断
                sourceNode.mediaStream.getTracks().forEach(track => track.stop());
                sourceNode.disconnect();
                sourceNode = null;
            }

            if (audioContext && audioContext.state !== 'closed') {
                audioContext.close().catch(e => console.warn('AudioContext終了エラー:', e));
            }

            isMicActive = false;
            recIndicator.classList.add('hidden');
            smallStatus.classList.remove('active');
            
            // Webソケット接続を切断（クリーンアップ）
            if (ws) {
                ws.close();
                ws = null;
            }
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
        
        aiCompositionLogic(normalizedPeak); // 関数名は維持し、中身を抽象データ送信に変更

        animationFrameId = requestAnimationFrame(drawAnalysis);
    } catch (error) {
        console.error('分析エラー:', error);
        stopMicInput();
    }
}

// =========================================================================
// ★ 音楽表現の完全排除とWebソケットによる抽象データ送信
// =========================================================================

function initializeSynth() {
    // MAX/MSPに抽象データを送信するWebソケットの初期化のみを行う
    if (ws === null) {
        try {
            ws = new WebSocket(WS_URL);
            ws.onopen = () => {
                smallStatus.textContent = "MAX/MSPに接続完了。データ送信準備OK。";
                console.log("WebSocket接続成功");
            };
            ws.onerror = (e) => {
                smallStatus.textContent = "エラー: MAX/MSP接続不可。8080ポートを確認。";
                console.error("WebSocketエラー:", e);
            };
            ws.onclose = () => {
                console.log("WebSocket接続切断");
                if (isMicActive) {
                    smallStatus.textContent = "MAX/MSPとの接続が切れました。";
                }
            };
        } catch (e) {
            smallStatus.textContent = "エラー: WebSocket初期化失敗。";
        }
    }
}


function aiCompositionLogic(currentVolume) {
    if (currentProfile.length === 0) return;

    // ★ パフォーマンス最適化: 送信頻度を制限
    const currentTime = performance.now();
    if (currentTime - lastAnalysisTime < ANALYSIS_INTERVAL) return;
    lastAnalysisTime = currentTime;

    // ----------------------------------------------------
    // 1. 乖離スコアの計算 (分析ロジックは維持)
    // ----------------------------------------------------
    let totalScore = 0;
    const profileCount = currentProfile.length;
    
    for (let p = 0; p < profileCount; p++) {
        const profileData = currentProfile[p].data;
        let sumOfSquaredDifferences = 0;
        
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
    // 2. 抽象化データ（乖離スコア）の外部送信
    // ----------------------------------------------------
    if (ws && ws.readyState === WebSocket.OPEN) {
        // スコアとボリュームをJSON形式でリアルタイム送信
        const dataToSend = JSON.stringify({
            score: normalizedScore.toFixed(4),
            isDivergent: normalizedScore > scoreThreshold,
            volume: currentVolume.toFixed(2) // 生の音量レベルも送る
        });
        
        ws.send(dataToSend);
        
        // UIフィードバック
        if (normalizedScore >= 0.5) {
            statusArea.classList.add('glitch-active');
            volumeBar.classList.add('divergence-high');
            smallStatus.textContent = `💥 乖離スコア送信中: ${normalizedScore.toFixed(3)}`;
        } else {
            statusArea.classList.remove('glitch-active', 'glitch-light');
            volumeBar.classList.remove('divergence-light', 'divergence-medium', 'divergence-high', 'divergence-intense');
            smallStatus.textContent = `固有性維持中: ${normalizedScore.toFixed(3)}`;
        }
    } else {
        smallStatus.textContent = "MAX/MSPと未接続。分析のみ実行中...";
    }
}

// --- 改善されたマイク入力ロジック ---
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
        if (!audioContext || audioContext.state === 'closed') {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') { await audioContext.resume(); }
            
            // initializeSynthを呼び出し、Webソケット接続を開始
            initializeSynth(); 
        }
        
        // 高品質なマイクアクセス設定
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
                echoCancellation: true, noiseSuppression: true, autoGainControl: true,
                sampleRate: 44100, channelCount: 1
            }
        });
        
        if (!stream.active) { throw new Error('ストリームが非アクティブです'); }
        
        sourceNode = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        
        analyser.fftSize = 512;
        analyser.minDecibels = -90;
        analyser.maxDecibels = -10;
        analyser.smoothingTimeConstant = 0.8;
        
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        sourceNode.connect(analyser);
        
        isMicActive = true;
        smallStatus.classList.add('active');

        if (isCollecting) {
            if (currentProfile.length >= 3) return; 
            
            try {
                // 収集中は音源フィードバックを抑制しながら行う（任意）
                const gainNode = audioContext.createGain();
                gainNode.gain.value = 0.3;
                sourceNode.connect(gainNode);
                gainNode.connect(audioContext.destination);
                recIndicator.classList.remove('hidden'); 
            } catch (e) { console.warn('フィードバック接続をスキップ:', e); }
            
            smallStatus.textContent = `収集中 (${currentProfile.length + 1}/3)... 30秒間音を鳴らしてください。`;
            setTimeout(() => {
                stopMicInput();
                analyzeAndSaveProfile(); 
            }, 30000); 
        } else {
            // 実行モードでは音を出さない
            recIndicator.classList.add('hidden');
            if (ws && ws.readyState === WebSocket.OPEN) {
                smallStatus.textContent = `分析・送信中...`;
            } else {
                 smallStatus.textContent = `分析中... (MAX/MSPに未接続)`;
            }
        }
        
        drawAnalysis();

    } catch (err) {
        // (省略: 詳細なエラーハンドリングロジックは維持)
        let errorMessage = 'マイクエラー: ';
        switch (err.name) {
            case 'NotAllowedError': errorMessage += 'アクセス拒否。設定を確認してください。'; break;
            case 'NotFoundError': errorMessage += 'マイクが見つかりません。'; break;
            case 'SecurityError': errorMessage += 'HTTPSで接続してください。'; break;
            default: errorMessage += err.message || '不明なエラー';
        }
        smallStatus.textContent = errorMessage;
        isMicActive = false;
        recIndicator.classList.add('hidden');
        smallStatus.classList.remove('active');
        setTimeout(() => { smallStatus.textContent = 'クリックして再試行'; }, 3000);
    }
}
