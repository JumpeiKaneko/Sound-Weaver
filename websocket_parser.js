// websocket_parser.js の全文
// Webソケットのデータ（JSONテキスト）をMAXのdictオブジェクトに変換します。

// MAX APIへの参照を取得
const Max = require('max-api');

// 統計情報とデバッグ用のカウンター
let messageCount = 0;
let errorCount = 0;
let lastMessageTime = 0;

// 初期化メッセージ
Max.post("🎵 Sound Weaver WebSocket Parser 初期化完了\n"); 

// パッチ側からの入力（Webソケットのデータ）を受け取る関数
Max.addHandler("msg_in", (data) => {
    
    // 入力データの詳細検証
    if (!data) {
        Max.post("Error: 受信データが null または undefined です\n");
        return;
    }
    
    if (typeof data !== 'string') {
        Max.post("Error: 受信データが文字列ではありません (型: " + typeof data + ")\n");
        return;
    }
    
    if (data.trim().length === 0) {
        Max.post("Error: 受信データが空文字列です\n");
        return;
    }
    
    try {
        // JSONパースと構造検証
        const json_data = JSON.parse(data);
        
        // Sound Weaver からの期待されるデータ構造をチェック
        if (typeof json_data !== 'object' || json_data === null) {
            Max.post("Error: JSONデータがオブジェクトではありません\n");
            return;
        }
        
        // 必須フィールドの存在チェック (Sound Weaver仕様)
        const requiredFields = ['score', 'isDivergent', 'volume'];
        const missingFields = requiredFields.filter(field => !(field in json_data));
        
        if (missingFields.length > 0) {
            Max.post("Warning: 必須フィールドが不足: " + missingFields.join(', ') + "\n");
        }
        
        // 一意なdict名を生成（タイムスタンプ使用）
        const dictName = 'sw_data_' + Date.now();
        const d = new Max.Dict(dictName);
        
        // JSONデータをdictに安全に書き込み
        for (const key in json_data) {
            if (json_data.hasOwnProperty(key)) {
                const value = json_data[key];
                
                // 値の型チェックと変換
                if (typeof value === 'number' && !isNaN(value)) {
                    d.set(key, value);
                } else if (typeof value === 'string') {
                    d.set(key, value);
                } else if (typeof value === 'boolean') {
                    d.set(key, value ? 1 : 0); // MAX用にブール値を数値に変換
                } else {
                    Max.post("Warning: 未対応の値型 (" + key + ": " + typeof value + ")\n");
                }
            }
        }
        
        // タイムスタンプを追加
        d.set('timestamp', Date.now());
        d.set('source', 'sound_weaver');
        
        // dictをMAXパッチに出力
        Max.outlet("dictionary", dictName);
        
        // 統計情報の更新
        messageCount++;
        lastMessageTime = Date.now();
        
        // デバッグ情報（オプション - 1秒に1回程度に制限）
        if (messageCount % 20 === 0) {
            Max.post("✓ データ処理完了: " + dictName + " (スコア: " + json_data.score + ", 総受信数: " + messageCount + ")\n");
        }
        
    } catch (e) {
        errorCount++;
        Max.post("JSON Parsing Error #" + errorCount + ": " + e.message + "\n");
        Max.post("受信データ: " + data.substring(0, 100) + (data.length > 100 ? "..." : "") + "\n");
        
        // エラー情報をdictとして出力（デバッグ用）
        try {
            const errorDict = new Max.Dict('sw_error_' + Date.now());
            errorDict.set('error', true);
            errorDict.set('message', e.message);
            errorDict.set('errorCount', errorCount);
            errorDict.set('timestamp', Date.now());
            Max.outlet("dictionary", errorDict.name);
        } catch (dictError) {
            Max.post("Critical Error: dict作成に失敗: " + dictError.message + "\n");
        }
    }
});

// 統計情報出力ハンドラー（デバッグ用）
Max.addHandler("get_stats", () => {
    Max.outlet("stats", {
        messageCount: messageCount,
        errorCount: errorCount,
        lastMessageTime: lastMessageTime,
        uptime: Date.now() - (lastMessageTime || Date.now())
    });
});
