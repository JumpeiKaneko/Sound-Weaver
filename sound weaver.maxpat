{
	"patcher" : 	{
		"fileversion" : 1,
		"appversion" : 		{
			"major" : 9,
			"minor" : 0,
			"revision" : 4,
			"architecture" : "x64",
			"modernui" : 1
		}
,
		"classnamespace" : "box",
		"rect" : [ 92.0, 112.0, 635.0, 654.0 ],
		"gridsize" : [ 15.0, 15.0 ],
		"boxes" : [ 			{
				"box" : 				{
					"id" : "obj-9",
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 208.17609715461731, 137.106915950775146, 114.0, 22.0 ],
					"text" : "run, ws.server 8080"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-5",
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 256.603769302368164, 83.018866539001465, 77.0, 22.0 ],
					"text" : "ws.server $1"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-2",
					"maxclass" : "toggle",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "int" ],
					"parameter_enable" : 0,
					"patching_rect" : [ 286.792448043823242, 176.100625991821289, 24.0, 24.0 ],
					"svg" : ""
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-8",
					"maxclass" : "number",
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "", "bang" ],
					"parameter_enable" : 0,
					"patching_rect" : [ 63.200000941753387, 302.400004506111145, 50.0, 22.0 ]
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-6",
					"maxclass" : "number",
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "", "bang" ],
					"parameter_enable" : 0,
					"patching_rect" : [ 155.0, 302.400004506111145, 50.0, 22.0 ]
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-4",
					"maxclass" : "newobj",
					"numinlets" : 3,
					"numoutlets" : 3,
					"outlettype" : [ "", "", "" ],
					"patching_rect" : [ 63.0, 201.600003004074097, 111.0, 22.0 ],
					"text" : "route score volume"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-20",
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 202.515719890594482, 45.0, 90.0, 22.0 ],
					"text" : "ws.server 8080"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-17",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "", "" ],
					"patching_rect" : [ 63.0, 147.0, 67.0, 22.0 ],
					"saved_object_attributes" : 					{
						"autostart" : 0,
						"defer" : 0,
						"node_bin_path" : "",
						"npm_bin_path" : "",
						"watch" : 0
					}
,
					"text" : "node.script",
					"textfile" : 					{
						"text" : "// node.script に直接ペーストする修正コード\nconst Max = require('max-api');\nconst WebSocket = require('ws'); \n\nlet wss;\n\n// ★ Node.jsが初期化されたら即座にサーバーを起動\nfunction initializeServer() {\n    const port = 8080; \n    if (wss) wss.close();\n    \n    wss = new WebSocket.Server({ port: port });\n    Max.post(`[SW-WS] Server listening on port ${port}...`);\n\n    wss.on('connection', (ws) => {\n        Max.post(\"[SW-WS] Client connected.\");\n        ws.on('message', (message) => {\n            try {\n                const json_data = JSON.parse(message);\n                \n                // 第1アウトレットから score と volume を route で分離できるように出力\n                Max.outlet(0, \"score\", parseFloat(json_data.score));\n                Max.outlet(0, \"volume\", parseFloat(json_data.volume));\n                \n            } catch (e) {\n                Max.post(\"JSON Parsing Error: \" + e.message);\n            }\n        });\n        ws.on('close', () => Max.post(\"[SW-WS] Client disconnected.\"));\n    });\n}\n\n// Node.js環境が読み込まれたらサーバーを起動\nMax.addHandler(\"load\", initializeServer); \n\n// MAXのインレットから 'close' メッセージが来たらサーバーを閉じる\nMax.addHandler(\"close\", () => {\n    if (wss) wss.close();\n    Max.post(\"[SW-WS] Server closed.\");\n});\n",
						"flags" : 2,
						"embed" : 1,
						"autowatch" : 0
					}

				}

			}
 ],
		"lines" : [ 			{
				"patchline" : 				{
					"destination" : [ "obj-4", 0 ],
					"source" : [ "obj-17", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-6", 0 ],
					"source" : [ "obj-4", 1 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-8", 0 ],
					"source" : [ "obj-4", 0 ]
				}

			}
 ],
		"originid" : "pat-14",
		"dependency_cache" : [ 			{
				"name" : "u806001244.js",
				"bootpath" : "~/Library/Application Support/Cycling '74/Max 9/Settings/temp64-Max",
				"patcherrelativepath" : "../../Library/Application Support/Cycling '74/Max 9/Settings/temp64-Max",
				"type" : "TEXT",
				"implicit" : 1
			}
 ],
		"autosave" : 0
	}

}
