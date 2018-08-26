/*
	Author: Stéphane Bascher
	Date: March-17-2015 - Version: 1.0 - Creation of the module
*/

var _ = require('underscore');
var moment = require('moment');
moment.locale('fr');

// Init js
var neTVClient = module.exports = function (opts) {
	
	if (!(this instanceof neTVClient)) {
		return new neTVClient(opts);
	}
	
	opts = opts || {};
	this.lang = this.lang || opts.lang;
	this.msg = this.msg || require('./lang/' + this.lang);
	this.avatar_client = this.avatar_client || opts.client;
	this.tvdb = this.tvdb || this.dbinit();
	this.debug = this.debug || opts.debug;
	this.fifo = this.fifo || opts.fifo;
	this.autoDestroy = this.autoDestroy || opts.autoDestroy;
	
	// Check program
	this.Tvcron = function (TVProgs) {this.dbTVCron(this.tvdb,0,TVProgs,this,this.dbTVCron)};
	// Save program
	this.TvSave = function (title,channelId,channelName) {this.dbTVSave(title,channelId,channelName)};
	
	this.RememberRecord = function (title, date, hour, duration,channelID,channelName) {this.dbRememberRecord(title, date, hour, duration,channelID,channelName) };
	
	this.isRecords = function () { this.isRecordedProgram()};
	
	this.removeRemembers = function () { this.removeRememberPrograms()};
}


// Init nedb database
neTVClient.prototype.dbinit = function () {
	var dbstore = require('nedb'),
	    dbfile = __dirname + '/db/tvSchedule.db',
	    db = new dbstore({ filename: dbfile});
	db.loadDatabase();
	return db; 
}


neTVClient.prototype.removeRememberPrograms = function () {
	
	var client = this;
	client.tvdb.find({Recorded: false}, function (err, docs) {
		if (err){
			info("Enable to retrieve recorded programs to removing, error:", err);
			return;
		}

		if (docs.length > 0) {			
			Avatar.speak(client.msg.localized('remembertoRemove').replace('%d',docs.length), client.avatar_client, function() {
				client.removeProgs(docs,0,client,client.removeProgs);
			});
		} else {
			Avatar.speak(client.msg.localized('noRemembertoRemove'), client.avatar_client, function() {
				Avatar.Speech.end(client.avatar_client);
			});
		}
	});
}


neTVClient.prototype.removeProgs = function (docs,pos,client,callback) {
	
	if (!callback || pos == docs.length) {
		Avatar.speak(client.msg.localized('askend'), client.avatar_client, function() {
				Avatar.Speech.end(client.avatar_client);
		});
		return;
	}
	
	Avatar.askme(client.msg.localized('askRemoveProgram').replace('%s',docs[pos].Title), client.avatar_client , 
	Config.modules.tvSchedule.askRemoveProgs,
	0, function(answer, end){	
		switch (answer) {
			case 'yes':
				client.tvdb.remove({ _id: docs[pos]._id }, function (err, numRemoved) {
					if (numRemoved > 0)
						var tts = client.msg.localized('removedProg').replace('%s',docs[pos].Title);
					else
						var tts = client.msg.localized('no_removedProg').replace('%s',docs[pos].Title);
					
					Avatar.speak(client.msg.localized('removedProg').replace('%s',docs[pos].Title), client.avatar_client, function() {
						setTimeout(function(){
							callback(docs,++pos,client,callback);
						}, 1000);
						if ((pos + 1) == docs.length) {
							end(client.avatar_client,true);
						} else {
							end(client.avatar_client);	
						}
					});
				});
				break;
			case 'no':		
				Avatar.speak(client.msg.localized('backtoType'), client.avatar_client, function() {
					setTimeout(function(){
						callback(docs,++pos,client,callback);
					}, 1000);
					if ((pos + 1) == docs.length) {
						end(client.avatar_client,true);
					} else
						end(client.avatar_client);				
				});
				break;
			case 'cancel':	
				Avatar.speak(client.msg.localized('terminateAsk'), client.avatar_client, function() {
					end(client.avatar_client,true);		
				});
				break;
		}
	});

}


neTVClient.prototype.dbTVCron = function (db,pos,TVProgs,client,callback, oneoff) {
	if (!callback || pos == TVProgs.length) {
		return;
	}
	// current date & hour
	var date = moment().format("YYYY-MM-DD"),
	    currentDate = moment().format("YYYY-MM-DDTHH:mm");
	
	db.findOne({Recorded: false, Title: TVProgs[pos].title}, function (err, doc) {
		if (err)
			return error('Enable to retrieve db scheduled programs', err.red);
		
		if (doc) {
			var hourStart = TVProgs[pos].start.split('T')[1];
			var isTime = istvtime(date+'T'+hourStart,currentDate);	
			if (isTime == true) {
				if (client.debug) info('Recording time for', TVProgs[pos].title);
				Avatar.call('scenariz', {command: 'saveCron', 
										program: client.msg.localized('rememberProgram').replace('%s',TVProgs[pos].title).replace('%d',hourStart),
										name: client.msg.localized('rememberProgram').replace('%s',TVProgs[pos].title).replace('%d',hourStart),
										exec: 'true',
										order: '1',
										plug: 'freeboxTV',
										start: hourStart+'-1111111',
										key: 'command=tvShow~title='+TVProgs[pos].title+'~hour='+hourStart+'~duration='+TVProgs[pos].duration+'~channelID='+TVProgs[pos].number.toString()+'~channelName='+TVProgs[pos].name+'~client=currentRoom',
										autodestroy: client.autoDestroy,
										mute: 'true',	
										client: 'Salon',
										cronClient : 'currentRoom',
										fifo: client.fifo
										}, function(cb){ 
											setTimeout(function(){
												(!oneoff) ? callback (db,++pos,TVProgs,client,callback) : callback ();
											}, 1000);
									});	
			} else if (isTime == 'now') {
				if (client.debug) info('Show time for', TVProgs[pos].title);				
				Avatar.call('freeboxTV', {command: 'tvShow', 
										  client: client.avatar_client,
										  title: TVProgs[pos].title,
										  hour: hourStart,
										  duration: TVProgs[pos].duration,
										  channelID: TVProgs[pos].number,
										  channelName: TVProgs[pos].name
										}, function(cb){ 
											setTimeout(function(){
												(!oneoff) ? callback (db,++pos,TVProgs,client,callback) : callback ();
											}, 20000);
									});			
			} else {
				// Cherche le suivant...
				if (!oneoff && TVProgs[pos].next && TVProgs[pos].next != 'fake_next') {
					var ISO_X = timeConverter(TVProgs[pos].next);
					getPrograms (TVProgs, TVProgs[pos].next, ISO_X, pos, pos + 1, [], function (tvprev) { 
						if (tvprev && tvprev.length == 1) {
							callback (db,0,tvprev,client,function() { 
								callback (db,++pos,TVProgs,client,callback);
							}, true );
							
						} else
							(!oneoff) ? callback (db,++pos,TVProgs,client,callback) : callback ();
					}, TVProgs[pos].next);		
				} else
					(!oneoff) ? callback (db,++pos,TVProgs,client,callback) : callback ();
			}
		} else {
			// Cherche le suivant...
			if (!oneoff && TVProgs[pos].next && TVProgs[pos].next != 'fake_next') {
				var ISO_X = timeConverter(TVProgs[pos].next);
				getPrograms (TVProgs, TVProgs[pos].next, ISO_X, pos, pos + 1, [], function (tvprev) { 
					if (tvprev && tvprev.length == 1) {
						callback (db,0,tvprev,client,function() { 
							callback (db,++pos,TVProgs,client,callback);
						}, true );
						
					} else
						(!oneoff) ? callback (db,++pos,TVProgs,client,callback) : callback ();
				}, TVProgs[pos].next);		
			} else
				(!oneoff) ? callback (db,++pos,TVProgs,client,callback) : callback ();
		}
		
	});
}




function getPrograms (bouquetChannels, _X, _ISO_X, pos, max, programs, callback, linkTo) {
	
	if (pos == max) return callback (programs);
	
	var request = require('request');
	
	var url = "http://mafreebox.freebox.fr/api/v5/tv/epg/by_channel/" + bouquetChannels[pos].uuid + "/" + _X;
	
	request({ 'uri': url}, function (err, response, body) {
		if (err || response.statusCode != 200) 
		   return callback(false);
		
		body = JSON.parse(body);
		
		var endTime, flagfound;
		for(var i in body.result) {
		    var startTime = timeConverter(body.result[i].date);
			endTime = moment(startTime).add(body.result[i].duration, 'seconds').format("YYYY-MM-DDTHH:mm");
			if (!linkTo && !moment(_ISO_X).isAfter(endTime) && !moment(startTime).isAfter(_ISO_X) == true) {
				flagfound = true;
				break;
			}
			
			if (linkTo && body.result[i].date == linkTo) {
				flagfound = true;
				break;
			} 
		}

		//var duration = timeConverter(body.result[i].duration);
		//var duration = "";
		var diffMn = parseInt(moment(endTime).diff(startTime,"minutes"));
		var hour = Math.floor(diffMn/60);
		var minutes = diffMn%60;
		var duration = ((hour > 0) ? hour.toString().length == 1 ? '0' + hour.toString() : hour.toString() : "00")+":"+((minutes > 0) ? minutes.toString().length == 1 ? '0' + minutes.toString() : minutes.toString() : "00");
		var title = body.result[i].Title ? body.result[i].Title : body.result[i].title ? body.result[i].title : false;
		if (flagfound && title && title != Config.modules.freeboxTV.label_no_program)
			programs.push({	name: bouquetChannels[pos].name,
							number: bouquetChannels[pos].number,
							uuid: bouquetChannels[pos].uuid,
							title: title,
							sub_title: body.result[i].sub_title ? body.result[i].sub_title : false,
							category_name: body.result[i].category_name ? body.result[i].category_name : false,
							season_number: body.result[i].season_number ? body.result[i].season_number : false,
							episode_number: body.result[i].episode_number ? body.result[i].episode_number : false,
							id: body.result[i].id, 
							start: startTime,
							end: endTime,
							duration: duration,
							next: body.result[i].next ? body.result[i].next.split('_')[0] : false,
							prev: body.result[i].prev ? body.result[i].prev.split('_')[0] : false,
							X: body.result[i].date});
		
		getPrograms(bouquetChannels, _X, _ISO_X, ++pos, max, programs, callback);
		
	});
	

}



function timeConverter(UNIX_timestamp){
	
	var time = new Date(UNIX_timestamp * 1000);
	var month = parseInt(time.getMonth()+1).toString();
	month = month.length == 1 ? '0' + month : month;
	var day = time.getDate().toString();
	day = day.length == 1 ? '0' + day : day;
	var hour = time.getHours().toString();
	hour = hour.length == 1 ? '0' + hour : hour;
	var minutes = time.getMinutes().toString();
	minutes =  minutes.length == 1 ? '0' + minutes : minutes;
	return time.getFullYear()+'-'+month+'-'+day+'T'+hour+':'+minutes;
	
}



neTVClient.prototype.isRecordedProgram = function () {
	
	var client = this;
	client.tvdb.find({Recorded: true}, function (err, docs) {
		if (err){
			info("Enable to retrieve db recorded programs, error:", err);
			return;
		}
		
		if (docs.length > 0) {
			// Buble sort
			for (var i=0;i<docs.length;i++) {
				for (var a=0;a<docs.length;a++) {
					var tempdoc = {};
					if ( moment(docs[a].Date+'T'+docs[a].Hour).isAfter(docs[i].Date+'T'+docs[i].Hour) == true) {
						tempdoc = docs[i];
						docs[i] = docs[a];
						docs[a] = tempdoc;
					} 
				}
				if (i+1 == docs.length) {
					Avatar.speak(client.msg.localized('recordedProgram').replace('%d',docs.length), client.avatar_client, function() {
						setTimeout(function(){
							client.sayRecordedProg(docs,0,client,client.sayRecordedProg);
						}, 1000);
					});
				}
			}
		} else {
			Avatar.speak(client.msg.localized('noRecordedProgram'), client.avatar_client, function() {
				Avatar.Speech.end(client.avatar_client);
			});
		}
	});
}


neTVClient.prototype.sayRecordedProg = function (docs,pos,client,callback) {
	
	if (!callback || pos == docs.length) {
		Avatar.Speech.end(client.avatar_client);
		return;
	}
	
	var currentDate = moment().format("YYYY-MM-DD"),
		diffDays = moment(currentDate+'T'+docs[pos].Hour).diff(docs[pos].Date+'T'+docs[pos].Hour,"days");
	
	switch (diffDays) {
		case 0: // aujourd'hui
				var msg = client.msg.localized('TodayRecordedProgram').replace('%d',docs[pos].Hour);
				break;
		case 1: // hier
				var msg = client.msg.localized('YesterdayRecordedProgram').replace('%d',docs[pos].Hour);
				break;
		case 2: // avant-hier
				var msg = client.msg.localized('BeforeYesterdayRecordedProgram').replace('%d',docs[pos].Hour);
				break;
		default: // Direct le nombre de jours
				var msg = client.msg.localized('BeforeRecordedProgram').replace('%r',diffDays).replace('%d',docs[pos].Hour);
				break;
	}
		
	Avatar.speak(msg + client.msg.localized('sayRecordedProgram').replace('%s',docs[pos].Title).replace('%i',docs[pos].ChannelName), client.avatar_client, function() {
			client.tvdb.remove({ _id: docs[pos]._id }, function (err, numRemoved) {
				setTimeout(function(){
					callback(docs,++pos,client,callback);
				}, 1000);
			});
	});
}



neTVClient.prototype.dbTVSave = function (title,channelId,channelName) {
	
	var client = this;
	client.tvdb.findOne({Recorded:false, Title:title, ChannelId: channelId, ChannelName: channelName}, function (err, docfound) {
			if (err){
				error("Enable to retrieve Schedule Cron, error:", err.red);
				return;
			}
			
			if (!docfound) {
				client.tvdb.insert({
							Recorded: false,
							Title: title,
							ChannelId: channelId,
							ChannelName: channelName
					}, function(err, newDoc){
						if (!newDoc) 
							Avatar.speak(client.msg.err_localized('cron_not_saved').replace('%s',title), client.avatar_client);
						else 
							Avatar.speak(client.msg.localized('cron_saved').replace('%s',title), client.avatar_client);
					});		
			} else {
				Avatar.speak(client.msg.err_localized('tvProgExist').replace('%s',title), client.avatar_client);	
			}
	});		
}



neTVClient.prototype.dbRememberRecord = function (title, date, hour, duration,channelId,channelName) {
	var client = this;
	client.tvdb.findOne({Recorded: true, Title:title, Date:date, Hour:hour, Duration: duration, ChannelId: channelId, ChannelName: channelName}, function (err, docfound) {
			if (err){
				return error("Enable to retrieve recorded program, error:", err.red);
			}
			
			if (!docfound) {
				client.tvdb.insert({
							Recorded: true,
							Title: title,
							Date: date,
							Hour: hour,
							Duration: duration,
							ChannelId: channelId,
							ChannelName: channelName
					}, function(err, newDoc){
						if (!newDoc) 
							if (client.debug) info(client.msg.err_localized('recorded_cron_not_saved').replace('%s',title));
						else 
							if (client.debug) info(client.msg.localized('cron_saved').replace('%s',title));
				});		
			} 
			// else
				// client.SARAH.speak(client.msg.err_localized('recorded_cron_exist').replace('%s',title));			
	});	
}



// is it a good time ?
var istvtime = function (docDate, currentDate) {

	var addedDate = moment(currentDate).add(5, 'minutes').format("YYYY-MM-DDTHH:mm");
	if (moment(docDate).isAfter(addedDate) == true || moment(docDate).isSame(addedDate) == true)
		return true;
	else if (moment(docDate).isSame(currentDate)== true)
		return 'now';
	else
		return -1;

}