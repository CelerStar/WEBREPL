//获取当前窗口对象
var win = nw.Window.get();

//关闭窗体事件
$("#closeWin").click(function() {
	win.close();
});

//显示主窗体函数
var displayMainWin = function() {
	var options = {
		"width": 800,
		"height": 600,
		"min_width": 800,
		"min_height": 600,
		"max_width": 0,
		"max_height": 0,
		"frame":false
	};
	//开启新窗体
	nw.Window.open('index.html', options, function(new_win) {});
	
	//关闭旧窗体
	win.close();
}

//定时器执行主窗体打开事件
setTimeout("displayMainWin();", 2000);