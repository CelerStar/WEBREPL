var term;
var ws;
var connected = false;
var binary_state = 0;
var put_file_name = null;
var put_file_data = null;
var get_file_name = null;
var get_file_data = null;

function calculate_size(win) {
	var cols = Math.max(0, (win.innerWidth - 150) / 8) | 0;
	var rows = Math.max(0, (win.innerHeight - 20) / 22) | 0;
	return [cols, rows];
}

(function() {
	window.onload = function() {
		var size = calculate_size(self);
		term = new Terminal({
			cols: size[0],
			rows: size[1],
			useStyle: true,
			screenKeys: true,
			cursorBlink: false,

		});
		term.open(document.getElementById("term"));

	};

	window.addEventListener('resize', function() {
		var size = calculate_size(self);
		term.resize(size[0], size[1]);
		$("#termNav").width($(".terminal").width() + 8);
	});
}).call(this);

//连接按钮
$("#button").click(
	function() {
		if(connected) {
			ws.close();
		} else {
			document.getElementById('url').disabled = true;
			document.getElementById('button').innerHTML = "断开连接";
			connected = true;
			connect(document.getElementById('url').value);
		}

	}
)

//选择文件按钮
$("#put-file-select-d").click(
	function() {

		$("#put-file-select").click();
	}
)

//获取当前窗口对象
var win = nw.Window.get();


//esp8266按钮
$("#ESP8266").click(
	function() {
		nw.Shell.openExternal('http://micropython.openioe.net/');
	}
)

//celerstar按钮
$("#celerstar").click(
	function() {
		nw.Shell.openExternal('https://www.celerstar.com/');
	}
)

//关闭窗体事件
$("#closeWin").click(function() {
	win.close();
});


//最大化窗体事件
$("#max").click(function() {
	win.maximize();
});

//最小化窗体事件
$("#min").click(function() {
	win.minimize();
	
});

function prepare_for_connect() {
	document.getElementById('url').disabled = false;
	document.getElementById('button').innerHTML = "建立连接";
}

function update_file_status(s) {
	document.getElementById('file-status').innerHTML = s;
}

function connect(url) {
	ws = new WebSocket(url);
	ws.binaryType = 'arraybuffer';
	ws.onopen = function() {
		term.removeAllListeners('data');
		term.on('data', function(data) {
			data = data.replace(/\n/g, "\r");
			ws.send(data);
		});

		term.on('title', function(title) {
			document.title = title;
		});

		term.focus();
		term.element.focus();
		term.write('\x1b[31mwelcom OpenIOE ESP8266 WEBREPL!\x1b[m\r\n');

		ws.onmessage = function(event) {
			if(event.data instanceof ArrayBuffer) {
				var data = new Uint8Array(event.data);
				switch(binary_state) {
					case 11:
						// first response for put
						if(decode_resp(data) == 0) {
							// send file data in chunks
							for(var offset = 0; offset < put_file_data.length; offset += 1024) {
								ws.send(put_file_data.slice(offset, offset + 1024));
							}
							binary_state = 12;
						}
						break;
					case 12:
						// final response for put
						if(decode_resp(data) == 0) {
							update_file_status('发送' + put_file_name + ', ' + put_file_data.length + ' bytes');
						} else {
							update_file_status('上传失败' + put_file_name);
						}
						binary_state = 0;
						break;

					case 21:
						// first response for get
						if(decode_resp(data) == 0) {
							binary_state = 22;
							var rec = new Uint8Array(1);
							rec[0] = 0;
							ws.send(rec);
						}
						break;
					case 22:
						{
							// file data
							var sz = data[0] | (data[1] << 8);
							if(data.length == 2 + sz) {
								// we assume that the data comes in single chunks
								if(sz == 0) {
									// end of file
									binary_state = 23;
								} else {
									// accumulate incoming data to get_file_data
									var new_buf = new Uint8Array(get_file_data.length + sz);
									new_buf.set(get_file_data);
									new_buf.set(data.slice(2), get_file_data.length);
									get_file_data = new_buf;
									update_file_status('下载' + get_file_name + ', ' + get_file_data.length + ' bytes');

									var rec = new Uint8Array(1);
									rec[0] = 0;
									ws.send(rec);
								}
							} else {
								binary_state = 0;
							}
							break;
						}
					case 23:
						// final response
						if(decode_resp(data) == 0) {
							update_file_status('Got ' + get_file_name + ', ' + get_file_data.length + ' bytes');
							saveAs(new Blob([get_file_data], {
								type: "application/octet-stream"
							}), get_file_name);
						} else {
							update_file_status('下载失败' + get_file_name);
						}
						binary_state = 0;
						break;
					case 31:

						console.log('GET_VER', data);
						binary_state = 0;
						break;
				}
			}
			term.write(event.data);
		};
	};

	ws.onclose = function() {
		connected = false;
		if(term) {
			term.write('\x1b[31mrror!\x1b[m\r\n');
		}
		term.off('data');
		prepare_for_connect();
	}
}

function decode_resp(data) {
	if(data[0] == 'W'.charCodeAt(0) && data[1] == 'B'.charCodeAt(0)) {
		var code = data[2] | (data[3] << 8);
		return code;
	} else {
		return -1;
	}
}

function put_file() {
	var dest_fname = put_file_name;
	var dest_fsize = put_file_data.length;

	var rec = new Uint8Array(2 + 1 + 1 + 8 + 4 + 2 + 64);
	rec[0] = 'W'.charCodeAt(0);
	rec[1] = 'A'.charCodeAt(0);
	rec[2] = 1;
	rec[3] = 0;
	rec[4] = 0;
	rec[5] = 0;
	rec[6] = 0;
	rec[7] = 0;
	rec[8] = 0;
	rec[9] = 0;
	rec[10] = 0;
	rec[11] = 0;
	rec[12] = dest_fsize & 0xff;
	rec[13] = (dest_fsize >> 8) & 0xff;
	rec[14] = (dest_fsize >> 16) & 0xff;
	rec[15] = (dest_fsize >> 24) & 0xff;
	rec[16] = dest_fname.length & 0xff;
	rec[17] = (dest_fname.length >> 8) & 0xff;
	for(var i = 0; i < 64; ++i) {
		if(i < dest_fname.length) {
			rec[18 + i] = dest_fname.charCodeAt(i);
		} else {
			rec[18 + i] = 0;
		}
	}

	binary_state = 11;
	update_file_status('上传' + put_file_name + '...');
	ws.send(rec);
}

function get_file() {
	var src_fname = document.getElementById('get_filename').value;

	var rec = new Uint8Array(2 + 1 + 1 + 8 + 4 + 2 + 64);
	rec[0] = 'W'.charCodeAt(0);
	rec[1] = 'A'.charCodeAt(0);
	rec[2] = 2;
	rec[3] = 0;
	rec[4] = 0;
	rec[5] = 0;
	rec[6] = 0;
	rec[7] = 0;
	rec[8] = 0;
	rec[9] = 0;
	rec[10] = 0;
	rec[11] = 0;
	rec[12] = 0;
	rec[13] = 0;
	rec[14] = 0;
	rec[15] = 0;
	rec[16] = src_fname.length & 0xff;
	rec[17] = (src_fname.length >> 8) & 0xff;
	for(var i = 0; i < 64; ++i) {
		if(i < src_fname.length) {
			rec[18 + i] = src_fname.charCodeAt(i);
		} else {
			rec[18 + i] = 0;
		}
	}
	binary_state = 21;
	get_file_name = src_fname;
	get_file_data = new Uint8Array(0);
	update_file_status('下载 ' + get_file_name + '...');
	ws.send(rec);
}

function get_ver() {

	var rec = new Uint8Array(2 + 1 + 1 + 8 + 4 + 2 + 64);
	rec[0] = 'W'.charCodeAt(0);
	rec[1] = 'A'.charCodeAt(0);
	rec[2] = 3;

	binary_state = 31;
	ws.send(rec);
}

function handle_put_file_select(evt) {

	var files = evt.target.files;

	var f = files[0];
	put_file_name = f.name;
	var reader = new FileReader();
	reader.onload = function(e) {
		put_file_data = new Uint8Array(e.target.result);
		document.getElementById('put-file-list').innerHTML = '' + escape(put_file_name) + ' - ' + put_file_data.length + ' bytes';
		document.getElementById('put-file-button').disabled = false;
	};
	reader.readAsArrayBuffer(f);
}

document.getElementById('put-file-select').addEventListener('click', function() {
	this.value = null;
}, false);

document.getElementById('put-file-select').addEventListener('change', handle_put_file_select, false);
document.getElementById('put-file-button').disabled = true;