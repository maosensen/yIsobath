/**
 * 日本語。形は `en.ts` とまったく同じ(`Messages`)。macOS の呼び方に合わせる:
 * Finder、ゴミ箱、書類、フルディスクアクセス。"Survey" は等深線(isobath)の
 * 比喩どおり「測量」。
 */

import type { Messages } from "./index";

export const ja: Messages = {
	common: {
		cancel: "キャンセル",
		confirm: "確認",
		close: "閉じる",
		save: "保存",
		delete: "削除",
		loading: "読み込み中…",
	},
	theme: {
		light: "ライト",
		dark: "ダーク",
		system: "システムに合わせる",
	},
	language: {
		label: "言語",
	},
	survey: {
		label: "測量",
		wholeDisk: "ディスク全体",
		home: "ホームフォルダ",
		folder: "フォルダを選択…",
		pickTitle: "測量するフォルダを選択",
		again: "もう一度測量",
		demoVolume: "デモボリュームに戻る",
		surveying: "測量中",
		stopShow: "停止して表示",
		privacyNote:
			"読み取るのは名前・サイズ・日付だけです。このコンピュータの外には何も送りません。",
		stopped: "測量を途中で停止しました",
		unreadable: (n) => `読めないフォルダ ${n}`,
		unreadableHint:
			"macOS が yIsobath に一覧を許可しなかったフォルダです。空として数えています。",
		rightClick: "右クリックで Finder 表示・ゴミ箱へ",
	},
	access: {
		kicker: "測量の前に",
		missing: "yIsobath にはフルディスクアクセスがありません。",
		body: "デスクトップ・書類・ダウンロードを読む前に macOS が確認を求めます。ほかのアプリのフォルダはスキップされ、読めないフォルダとして数えられます。",
		open: "プライバシー設定を開く",
		anyway: "このまま測量",
		restart: "オンにしたら、yIsobath を終了して開き直してください。",
		grant: "アクセスを許可…",
	},
	item: {
		reveal: "Finder に表示",
		copyPath: "パスをコピー",
		trash: "ゴミ箱に入れる…",
		copied: "パスをコピーしました",
		loose: "細かいファイル：操作はそれらがあるフォルダに対して行います",
		expandFailed: "このフォルダを開けませんでした",
		demo: "デモボリュームには実際のファイルがありません",
	},
	change: {
		title: "前回の測量から",
		since: (when) => `${when} から`,
		dateFormat: "M月d日 HH:mm",
		first:
			"この場所の初めての測量です。次回の測量で、どこが増えたかを表示します。",
		partial: "この測量は途中で停止したため、前回とは比べません。",
		net: (was, now, ago) => `前回の測量（${ago}）から ${was} → ${now}。`,
		none: "目立って増えたフォルダはありません。",
		new: "新規",
	},
	trash: {
		title: (name) => `「${name}」をゴミ箱に入れますか？`,
		size: (bytes, files) => `${bytes} · ${files} ファイル`,
		rule: (title, risk) => `${title} · ${risk}`,
		space: "ゴミ箱を空にすると、空き容量が戻ります。",
		confirm: "ゴミ箱に入れる",
		working: "移動中…",
		done: (name) => `「${name}」をゴミ箱に入れました`,
		doneHint: "Finder でゴミ箱を空にすると、空き容量が戻ります。",
		failed: "ゴミ箱に入れられませんでした",
	},
	errors: {
		busy: "別の測量が実行中です。",
		internal: "問題が発生しました。",
		notFound: (what) => `見つかりません：${what}`,
		refused: {
			"no-survey": "まだ何も測量していません。",
			"not-absolute": "完全なパスではありません。",
			"outside-survey": "測量したフォルダの中にありません。",
			protected: "システムやアカウントが依存しているフォルダです。",
			system: "システムの一部です。",
			"in-trash": "すでにゴミ箱に入っています。",
		},
	},
	updates: {
		available: (version) => `バージョン ${version} が利用できます`,
		installAction: "インストールして再起動",
		installing: "アップデートをダウンロード中…",
		failed: "アップデートに失敗しました。あとでもう一度お試しください",
		upToDate: "最新バージョンです",
	},
	errorPage: {
		title: "問題が発生しました",
		hint: "画面で予期しないエラーが起きました。ホームに戻れば続けられます。繰り返し起きる場合は、アプリを再読み込みしてください。",
		goHome: "ホームに戻る",
		reload: "再読み込み",
		detailsLabel: "エラーの詳細",
	},
	changelog: {
		title: "新機能",
		subtitle: "各リリースのハイライト",
		back: "戻る",
		current: "現在のバージョン",
		kindNew: "新機能",
		kindImproved: "改善",
		kindFixed: "修正",
	},

	iso: {
		tag: "ボリューム測量",
		role: { data: "データ", home: "ホームフォルダ", folder: "フォルダ" },
		phase: {
			boot: "較正中",
			survey: "測量中",
			complete: "測量完了",
		},
		lens: {
			label: "表示",
			survey: "測量",
			type: "種類",
			age: "経過",
			reclaim: "回収",
		},
		view: { label: "視点", orbit: "周回", plan: "平面" },
		legend: {
			today: "今日",
			sixYears: "6年以上",
			ageNote: "各フォルダの経過年数の中央値（容量で重み付け）",
			none: "なし",
			all: "すべて",
			reclaimNote: "各フォルダのうち回収できる割合",
			folder: "フォルダ",
			file: "ファイル",
			loose: "細かいファイル",
			lines: "線1本 = 2,000 ファイル",
		},
		chip: {
			demoTitle: (host, when) => `デモボリューム（${when}、${host} で記録）`,
			demo: "デモ",
			free: (bytes) => `空き ${bytes}`,
			folder: (bytes, role) => `${bytes} · ${role}`,
		},
		scanRead: (files, folders, bytes) =>
			`${files} ファイル · ${folders} フォルダ · ${bytes}`,
		statusRead: (clock, files) => `${clock} · ${files} ファイル`,
		skip: "スキップ",
		replay: "再生",
		zoomOut: "縮小",
		zoomIn: "拡大",
		resetCamera: "視点をリセット",
		hint: "段をクリックで中へ · 中心をクリックで一つ上へ · ドラッグで回転",
		telemetry: { frame: "フレーム", sectors: "セクタ", buffer: "バッファ" },
		noWebgl:
			"この計器は WebGL2 で描画しますが、このコンピュータの WebView では使えませんでした。",
		relief:
			"ボリュームのレリーフ。矢印キーでフォルダ間を移動、Enter でフォルダを開き、Esc で一つ上へ。ドラッグで回転します。",
		announce: (name, bytes, share, of) => `${name}、${bytes}、${of}の ${share}`,
		announceOpen: "Enter で開きます。",

		actions: {
			survey: "この測量",
			folder: "このフォルダ",
			finder: "Finder",
			copyPath: "パスをコピー",
			trash: "ゴミ箱へ…",
			trashTitle: "ゴミ箱に入れる（⌘⌫）",
		},
		focus: {
			title: "フォーカス",
			share: "割合",
			files: "ファイル",
			folders: "フォルダ",
			age: "経過",
			reclaim: "回収",
			mostly: "主な種類",
			composition: "構成",
			listing: "一覧中…",
			largest: "中の大きいもの",
			items: (n) => `${n} 項目`,
		},
		search: {
			label: "名前で検索",
			waiting: "検索は測量のあとで",
			none: "一致する名前はありません",
			matches: () => "{b} 件一致",
		},
		rate: {
			unit: "件 / 秒",
			peak: (n) => `ピーク ${n}`,
		},
		log: {
			title: "測量",
			calibrating: "較正中",
			listed: "一覧済み",
			files: "ファイル",
			folders: "フォルダ",
			log: "測量ログ",
			replaying: (name, when) =>
				`${when} に記録した ${name} の測量を再生しています。`,
			surveyed: (root, when) =>
				`${when} に ${root} を測量しました。読み取ったのは名前・サイズ・日付だけです。`,
			sweep:
				"フォルダは一覧されるたびに立ち上がります。走査はディレクトリ順で、大きいものから進みます。",
		},
		findings: {
			label: "回収できる容量",
			title: "回収可能",
			count: (n) => `${n} 件`,
			inUse: (share, used, freeAfter) =>
				`使用中の ${used} のうち ${share} · 回収後の空き：${freeAfter}`,
			ofVolume: (share, used, freeAfter) =>
				`測量した ${used} のうち ${share} · 回収後の空き：${freeAfter}`,
			ofFolder: (share, used, root) => `${root} の ${used} のうち ${share}`,
			none: "ルールに当てはまるものはありません。依存フォルダ、ビルド出力、キャッシュ、インストーラ、重複ファイル、2年間手つかずの大きなファイルのどれもありません。",
			places: (n) => `${n} か所`,
			copy: "コピー",
			copied: "コピー済み",
			more: (n) => `ほか ${n} か所`,
			counted: (pct, gross) => `${gross} の ${pct}% として数えています。`,
		},
		strata: {
			title: "経過の地層",
			scale: "最終更新 · √ バイト",
			inSelection: (share, of) => `選択範囲に {b} · ${of}の ${share}`,
			untouched: (share, of) => `1年以上手つかず {b} · ${of}の ${share}`,
			survey: "測量全体",
			volume: "ボリューム全体",
			clear: "解除",
			slider: "最終更新からの経過で絞り込みます。ドラッグで範囲を選びます。",
			range: (from, to) => `${from}〜${to} 四半期前`,
			noFilter: "絞り込みなし",
			older: "それ以前",
		},
		crumbs: "パス",
		loose: {
			files: (n) => `${n} ファイル`,
			folders: (n) => `${n} フォルダ`,
		},

		hub: {
			calibrating: "較正中",
			surveying: "測量中",
			files: (n) => `${n} ファイル`,
			ofThe: (share, folder) =>
				`${folder ? "測量全体" : "ボリューム全体"}の ${share}`,
			of: (share, folder) =>
				`${folder ? "測量全体" : "ボリューム全体"}の ${share}`,
			ofView: (share) => `表示中の ${share}`,
			filesFolders: (files, folders) =>
				`${files} ファイル · ${folders} フォルダ`,
		},
		callout: {
			loose: "細かいファイル",
			folder: "フォルダ",
			folderEnter: "フォルダ · クリックで中へ",
			file: "ファイル",
			reclaimable: (rule) => `回収可能 · ${rule}`,
			modified: (age) => `${age}前に更新`,
			modifiedToday: "今日更新",
		},
	},
	types: {
		vid: "動画",
		img: "画像",
		aud: "オーディオ",
		mdl: "モデルの重み",
		src: "コード・依存",
		bin: "アプリ・ビルド",
		vmi: "イメージ・VM",
		arc: "アーカイブ",
		doc: "書類",
		sys: "システム関連",
	},
	risks: {
		regenerates: {
			label: "再生成",
			hint: "作ったツールが、必要なときに元に戻します。",
		},
		review: {
			label: "要判断",
			hint: "決めるのはあなたです。自動では作り直されません。",
		},
		final: {
			label: "不可逆",
			hint: "一度捨てたものです。空にすると完全に消えます。",
		},
	},
	rules: {
		trash: {
			title: "ゴミ箱",
			blurb: "すでに捨てたもの。ゴミ箱を空にするまで容量を占めたままです。",
			how: "Finder › ゴミ箱を空にする",
		},
		"xcode-build": {
			title: "Xcode のビルド成果物",
			blurb:
				"DerivedData とプレビューのキャッシュ。インデックス、中間ファイル、成果物は、次のビルドで Xcode が作り直します。",
		},
		simulators: {
			title: "使われなくなったランタイムのシミュレータ",
			blurb:
				"どのスキームも対象にしていない OS バージョンの、シミュレータとランタイムイメージ。",
		},
		"device-support": {
			title: "古い iOS のシンボル",
			blurb:
				"1年以上前の iOS を載せたデバイスからコピーしたデバッグシンボル。そのデバイスをつなぐと、Xcode がまたコピーします。",
		},
		"node-modules": {
			title: "依存フォルダ",
			blurb:
				"各プロジェクトの node_modules。インストールし直せば、パッケージストアから数秒で戻ります。",
		},
		"build-output": {
			title: "ビルド出力",
			blurb:
				"target、.next、.turbo、dist、release フォルダ。ビルドで書き出され、また書き出せるものすべて。",
		},
		"pkg-caches": {
			title: "パッケージマネージャのキャッシュ",
			blurb:
				"Homebrew、pip、uv、npm、Yarn、Bun、Cargo、Go は、ダウンロードしたすべてのバージョンを残しています。",
		},
		"app-caches": {
			title: "ブラウザとアプリのキャッシュ",
			blurb:
				"Resolve、Adobe、Lightroom、Spotify、Chrome などのメディアキャッシュ、Service Worker、レンダリングキャッシュ。",
			how: "各アプリの「キャッシュを消去」設定",
		},
		"render-media": {
			title: "Final Cut のレンダリングとプロキシ",
			blurb:
				"Final Cut ライブラリ内のレンダリングファイルとプロキシメディア。必要になれば Final Cut がまたレンダリングします。",
			how: "Final Cut Pro › ファイル › 生成されたライブラリファイルを削除",
		},
		docker: {
			title: "Docker の仮想ディスク",
			blurb:
				"イメージを取得するたびに大きくなり、自然には縮まないスパースディスクイメージ。約 70% は使われていないレイヤーです。",
		},
		installers: {
			title: "ダウンロードに残ったインストーラ",
			blurb: "役目を終えたディスクイメージ、パッケージ、ISO。",
		},
		logs: {
			title: "ログとクラッシュレポート",
			blurb: "診断レポートと、ローテーションされた古いログ。",
		},
		duplicates: {
			title: "同じ重みを2回ダウンロード",
			blurb:
				"複数の場所にある、バイト単位で同一のモデルファイル。Hugging Face のキャッシュ、ローカルのコピー、別のランタイムの保存先など。1つ残せば十分です。",
		},
		stale: {
			title: "2年間手つかずの大きなファイル",
			blurb:
				"1 GB を超え、測量の少なくとも2年前から誰も開いたり書き込んだりしていないファイル。",
		},
	},
	age: {
		today: "今日",
		days: (n) => `${n}日`,
		weeks: (n) => `${n}週`,
		months: (n) => `${n}か月`,
		years: (n) => `${n}年`,
	},
};
