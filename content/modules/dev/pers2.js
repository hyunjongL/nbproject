/*
 * pers.js: common fct for perspective-based views
 * This module defines the namespace NB.pers
 * It requires the following modules:
 *		Module
 *		NB
 *		NB.auth
 *		jquery
 *
 *
 Author 
 Sacha Zyto (sacha@csail.mit.edu) 

 License
 Copyright (c) 2010 Massachusetts Institute of Technology.
 MIT License (cf. MIT-LICENSE.txt or http://www.opensource.org/licenses/mit-license.php)
*/

try{    
    Module.require("NB", 0.1);
    Module.require("NB.auth", 0.1);
    Module.createNamespace("NB.pers", 0.1);
}
catch (e){
    alert("[inbox] Init Error: "+e);
}

/* trick for browsers that don't support document.activeElement 
   adapted from http://ajaxandxml.blogspot.com/2007/11/emulating-activeelement-property-with.html
*/
if (!("activeElement" in document)){
    document.activeElement = document.body;
    document.addEventListener("focus",function(evt){ 
	    document.activeElement = evt.target == document ? document.body : evt.target;
	} ,true);
    document.addEventListener("blur",function(evt){ 
	    document.activeElement = document.body;
	} ,true);
}



NB.pers.connection_id = 0;
NB.pers.first_connection = true;
NB.pers.connection_T = 1000;  // in msec

NB.pers.call = function(fctname, dict, callback, errback){
    if ((!NB.pers.first_connection) && NB.pers.connection_id == 0) {
	// we haven't received a reply yet so put this function to wait for a while
	NB.debug("waiting until we get a connection id...")
	window.setTimeout(function(){
		NB.pers.call(fctname, dict, callback, errback);
	    }, NB.pers.connection_T);
	return;
    }
    NB.pers.first_connection = false;
    var cb = function(x){
	if ("CID" in x.status){
	    NB.pers.connection_id = x.status.CID;
	}
	if (x.status.errno){
	    //just display that there was an error for now
	    if (errback != undefined){
		errback(x.status, x.payload);
	    }
	    NB.debug(x.status.msg);
	    return;
	}
	//     console.debug("cb w/ x=", x);
	callback(x.payload);
    };
    var auth_str = NB.conf.userinfo.guest ? "guest=1" : "ckey="+NB.conf.userinfo.ckey;
    $.post(NB.conf.servers.rpc+"/pdf4/rpc?"+auth_str ,{"cid": NB.pers.connection_id, "f": fctname, "a": JSON.stringify(dict)}, cb, "json");
};


NB.pers.__authenticate = function(init_ui){
    NB.conf.userinfo = JSON.parse(unescape(NB.auth.get_cookie("userinfo"))) || {guest: 1};    
    var uinfo = NB.conf.userinfo; //shortcut ! 
    var login_contents =  "";
    if (uinfo.guest != 0){
	login_contents = "<span id='login-name'>Guest</span> <a href='javascript:$.concierge.get_component(\"login_user_menu\")()'>Log in</a> <a href='javascript:$.concierge.get_component(\"register_user_menu\")()'>Register</a>";
	var $util_window = $.concierge.get_component("get_util_window")();
	$("#register_user_dialog, #login_user_dialog").remove();
	$util_window.append("<div xmlns=\"http://www.w3.org/1999/xhtml\" id=\"register_user_dialog\">   <div id='reg_welcome'>Welcome to NB !</div><div id='reg_benefits'>Registering only takes a few seconds and lets you annotate online PDFs...</div>  <table> <tr><td>Firstname</td><td><input type=\"text\" id=\"register_user_firstname\" /></td></tr> <tr><td>Lastname</td><td><input type=\"text\" id=\"register_user_lastname\" /></td></tr> <tr style=\"display: none;\"><td>Pseudonym</td><td><input type=\"text\" id=\"register_user_pseudonym\" /></td></tr><tr><td>Email</td><td><input type=\"text\" id=\"register_user_email\" /></td></tr><tr><td>Password</td><td><input type=\"password\" id=\"register_user_password1\" /></td></tr><tr><td>Confirm Password</td><td><input type=\"password\" id=\"register_user_password2\" /></td></tr></table>   <div>     <input type=\"checkbox\" id=\"termsandconditions\" />      <label for=\"termsandconditions\">I agree with <a target=\"_blank\" href=\"/terms_public_site\">NB Terms and Conditions</a></label></div>   <div class=\"form_errors\"></div> </div>").append("<div id='login_user_dialog' > <table> <tr><td>Email</td><td><input type='text'  id='login_user_email' ></input></td></tr><tr><td>Password</td><td><input type='password'  id='login_user_password' ></input></td></tr><tr><td></td><td><a href='/password_reminder'>Lost password ?</a></td></tr></table><div class='form_errors'/></div>");
	if (init_ui){
	    $("#login_user_password").keypress(function(e) {if(e.keyCode == 13 && this.value.length>0) {
			$.D("using shortcut");
			$("#login_user_dialog").parent().find("button:contains('Ok')").click();}});	
	}
    }
    else{
	var screenname = uinfo.firstname == null ? uinfo.email: $.E(uinfo.firstname) + " " + $.E(uinfo.lastname); 
	login_contents = "<span id='login-name'>"+screenname+"</span> <a href='javascript:NB.pers.logout()'>Log out</a>"
    }
    if (init_ui){
	$("#login-window").remove();
	$("body").append("<div id='login-window'><a href='/help' style='margin-right: 50px' target='_blank'>Help</a>"+login_contents+"</div>");
    }
    NB.pers.params = NB.dom.getParams();
}

    NB.pers.preinit = function(init_ui){
	if (init_ui == undefined){
	    init_ui = true;
	}
	$.concierge.addComponents(NB.pers.__components);
	NB.pers.__authenticate(init_ui);   
	if ("init" in NB.pers){ 
	    NB.pers.init();
	}
    };
    

NB.pers.logout = function(){
    NB.auth.delete_cookie("userinfo");
    NB.auth.delete_cookie("ckey");
    document.location.pathname ="/logout";
};
  
/* stuff that can be used in various views */
NB.pers.__components = {
    location_closestpage:  function(p, cb){ 
	/* given a location and id (in payload) returns "closest" location id found on a different page: 
	   - if "direction" is "down": "closest" is the location at the top-most position of the next page which has a location
	   - if "direction" is "up": "closest" is the location at the bottom-most position of the previous page which has a location
	*/
	var m = p.model;
	var loc = m.o.location[p.id];
	var me = $.concierge.get_component("get_userinfo")();
	var file = m.o.file[loc.id_source];
	var page = loc.page;
	var f_sort_down = function(o1, o2){return o1.top-o2.top};	
	var TYPE_STAR = $.concierge.get_constant("STAR");
 	var TYPE_QUESTION = $.concierge.get_constant("QUESTION");
	var new_id = null;    
	var i, ids;
	var locs;
	if (p.direction == "down"){
	    i = page+1;
	    while (i<=file.numpages){
		locs = m.get("location", {id_source: loc.id_source, page: i});
		if (p.filters){
		    if (p.filters.me){
			locs = locs.intersect(m.get("comment", {id_author: me.id}).values("ID_location"));
		    }
		    if (p.filters.star){
			locs = locs.intersect(m.get("threadmark", {active: true, type: TYPE_STAR }).values("location_id"));
		    }
		    if (p.filters.question){
			locs = locs.intersect(m.get("threadmark", {active: true, type: TYPE_QUESTION }).values("location_id"));
		    }
		}
		if (locs.length()){
		    new_id = locs.min("top");
		    break;
		}
		i++;
	    }
	}
	else{
	    i = page-1;
	    while (i>0){
		locs = m.get("location", {id_source: loc.id_source, page: i});
		if (p.filters){
		    if (p.filters.me){
			locs = locs.intersect(m.get("comment", {id_author: me.id}).values("ID_location"));
		    }
		    if (p.filters.star){
			locs = locs.intersect(m.get("threadmark", {active: true, type: TYPE_STAR }).values("location_id"));
		    }
		    if (p.filters.question){
			locs = locs.intersect(m.get("threadmark", {active: true, type: TYPE_QUESTION }).values("location_id"));
		    }
		}
		if (locs.length()){
		    new_id = locs.max("top");
		    break;
		}
		i--;
	    }
	}
	return new_id;
    }, 
    register_user_menu : function(P, cb){
	$.D("register_user_menu");
	$('#register_user_dialog').dialog({
		title: "Register for a new account...", 
		    width: 400,
		    buttons: { 
		    "Cancel": function() { 
			$(this).find("div.form_errors").empty();
			$(this).dialog("destroy");  
		    },
			"Ok": function() {
			    var $dlg = $(this);
			    var err = function(msg){
				$dlg.find("div.form_errors").hide().text(msg).show("fast");
			    };
			    if ($("#register_user_password1")[0].value != $("#register_user_password2")[0].value){
				err("passwords don't match: please retype them");
				return;
			    }
			    if ($("#register_user_firstname")[0].value.length==0){
				err("Please enter your firstname");
				return;
			    }
			    if ($("#register_user_lastname")[0].value.length==0){
				err("Please enter your lastname");
				return;
			    }
			    if ($("#register_user_email")[0].value.match(/^([^@ ]+)@+([^@ ]+)$/)==null){
				err("Please enter a valid e-mail address");
				return;
			    }
			    if ($("#termsandconditions:checked").length == 0){
				err("You need to accept NB terms and conditions in order to register.");
				return;
			    }
			    var payload = {
				firstname: $("#register_user_firstname")[0].value, 
				lastname: $("#register_user_lastname")[0].value, 
				email: $("#register_user_email")[0].value, 
				pseudonym: $("#register_user_pseudonym")[0].value,
				password: $("#register_user_password1")[0].value, 
				ckey: NB.conf.userinfo.ckey};
			    $.concierge.get_component("register_user")(payload, function(p){
				    $.I("Thanks for registering... You should receive a confirmation code by email in less than a minute...");
				    $dlg.dialog("destroy");
				}, function(status, p){
				    err(status.msg);});
			}
		}
	    });
	$('#register_user_dialog').dialog("open");
    }, 
    login_user_menu: function(P,cb){
	$.D("login_user_menu");
	$('#login_user_dialog').dialog({
		title: "Log in...", 
		    width: 390,
		    buttons: { 
		    "Cancel": function() { 
			$(this).find("div.form_errors").empty();
			$(this).dialog("destroy");  
		    },
			"Ok": function() { 
			    var $dlg = $(this);
			    var err = function(msg){
				$dlg.find("div.form_errors").hide().text(msg).show("fast");
			    };
			    var payload = { 
				email: $("#login_user_email")[0].value,
				password: $("#login_user_password")[0].value
			    };
			    $.concierge.get_component("login_user")(payload , function(p){
				    if (p.ckey != null){
					//					NB.auth.set_cookie("userinfo", escape("{ckey: \""+p.ckey+"\"}"));
					NB.auth.set_cookie("ckey", p.ckey);
					document.location ="http://"+document.location.host+document.location.pathname;
					$.I("Welcome !");
				    }
				    else{
					err("email or password doesn't match. Please try again");
				    }
				});
			}
		}
	    });	
	$('#login_user_dialog').dialog("open");
    }, 
    get_util_window: function(P, cb){
	var $util_window = $("div.util_windows");
	
	if ($util_window.length == 0){
	    $util_window = $("<div class='util_windows' style='display:none'/>");
	}
	$("body").append($util_window);
	return $util_window
    }, 
    register_user: function(P, cb, eb){
	NB.pers.call("register_user", P, cb, eb);
    }, 
    login_user: function(P, cb){
	NB.pers.call("login_user", P, cb);
    }, 
    get_userinfo: function(P, cb){
	return NB.conf.userinfo;
    }, 
    mini_splashscreen: function(P,cb){
	var widget;
	if (NB.conf.userinfo.guest != 0){ //splashscreen for non-registered user
	    widget =  "<div xmlns=\"http://www.w3.org/1999/xhtml\" class=\"minisplashscreen ui-corner-all\">  <div id=\"splash-welcome\">Welcome to NB !</div><div id=\"nb-def\">...a forum on top of every PDF.</div> <ul id=\"splash-list-instructions\"> <li>Use your mouse or the <span class=\"ui-icon ui-icon-circle-triangle-w\"></span> and <span class=\"ui-icon ui-icon-circle-triangle-e\"></span> keys to move from discussion to discussion.</li> <li>Use your mouse or the  <span class=\"ui-icon ui-icon-circle-triangle-n\"></span> and  <span class=\"ui-icon ui-icon-circle-triangle-s\"></span> keys to scroll up and down the document.</li> <li>New user ? <a href='javascript:$.concierge.get_component(\"register_user_menu\")()'>Register</a> now to be able to post comments...</li> <li>Existing user ? <a href='javascript:$.concierge.get_component(\"login_user_menu\")()'>Log in</a> now...</li> </ul>  <a target=\"_blank\" href=\"/help\">More help...</a>  </div>       ";
	}
	else{ //splashscreen for registered user
	    widget = "<div xmlns=\"http://www.w3.org/1999/xhtml\" class=\"minisplashscreen ui-corner-all\">  <div id=\"splash-welcome\">Welcome to NB !</div> <ul id=\"splash-list-instructions\"> <li>Use your mouse or the <span class=\"ui-icon ui-icon-circle-triangle-w\"></span> and <span class=\"ui-icon ui-icon-circle-triangle-e\"></span> keys to move from discussion to discussion.</li> <li>Use your mouse or the  <span class=\"ui-icon ui-icon-circle-triangle-n\"></span> and  <span class=\"ui-icon ui-icon-circle-triangle-s\"></span> keys to scroll up and down the document.</li> <li>Drag across any region on the pdf to create a new discussion</li> <li>Right-click on any comment to post a reply</li> </ul>  <a target=\"_blank\" href=\"/help\">More help...</a>  </div>       ";
	}
	return widget;
    },
    note_deleter: function(P, cb){NB.pers.call("deleteNote", P, cb);},
    rate_reply: function(P,cb){NB.pers.call("rate_reply", P, cb);}, 
    mark_thread: function(P,cb){NB.pers.call("markThread", P, cb);},
    get_login_window: function(P,cb){
	return $("#login-window");
    }, 
    get_file_stats: function(P,cb){
	var payload_objects = {types: ["file_stats"]};
	if ("id_ensemble" in P){
	    payload_objects["payload"]= {id_ensemble: P.id_ensemble};
	}
	NB.pers.call("getObjects",payload_objects, cb);
    }, 
    in_progress: function(P,cb){
	var msg="Loading in progress...";
	if (P != undefined && "msg" in P){
	    msg = P.msg;
	}
	return "<div align='center' class='loadingpane'><img src='content/data/icons/gif/loader1.gif'/><div class='loadingpane-msg'>"+msg+"</div></div>";
    }, 
    pretty_print_timedelta: function(P,cb){
	var d = new Date(P.t);
	var now = new Date();
	var delta_s = parseInt((now-d)/1000);	
	var s = "";
	if (delta_s<3600){	   
	    s += (parseInt(delta_s/60) + " minutes ago");
	}
	else if (delta_s < 3600*24){
	    s += (parseInt(delta_s/3600) + " hours ago");
	}
	else{
	    s += (parseInt(delta_s/(3600*24)) + " days ago");
	}
	return s;
    }
};