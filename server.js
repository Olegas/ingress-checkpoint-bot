var
   express = require('express'),
   https = require('https'),
   app = express(),
   util = require('util');

const botHost = 'ingress-checkpoint-bot.herokuapp.com';
const apiKey = '100043642:AAGSlRy2uxbx_bUkYfpa96Rxo04sLwoNqVs';
const baseCheckpointTimestamp = +new Date(2015, 7, 12, 17, 0, 0);
const checkpointLength = 5 * 60 * 60 * 1000;

function zPad(v) {
   if (+v < 10) {
      return '0' + v;
   } else {
      return v;
   }
}

function mkCallUrl(method, params) {
   return 'https://api.telegram.org/bot' + apiKey + '/' + method + '?' + Object.keys(params).reduce(function (a, param) {
         a.push(encodeURIComponent(param) + '=' + encodeURIComponent(params[param]));
         return a;
      }, []).join('&');
}

function poll(callback) {
   var lastOffset = 0;
   function pollInternal() {
      var url = mkCallUrl('getUpdates', { timeout: 5, offset: lastOffset });
      console.log('Polling %s', url);
      https.get(url, function (res) {
         var data = '';
         res.setEncoding('utf8');
         res.on('data', function (chunk) {
            data += chunk;
         });
         res.on('end', function () {
            try {
               data = JSON.parse(data);
            } catch (e) {
               // TODO log
            }
            if (data.ok) {
               if (data.result.length > 0) {
                  var updateIds = data.result.map(function (update) {
                     return update.update_id;
                  });
                  lastOffset = Math.max.apply(Math, updateIds) + 1;
               } else {
                  lastOffset = 0;
               }
            } else {
               // TODO log
            }
            if (data) {
               callback(data.result);
            }
            pollInternal();
         });
      }).on('error', pollInternal);
   }

   setTimeout(pollInternal, 1000);
}

function getNearestCheckpoint(base) {
   var delta, hr, min, sec;

   base = base || Date.now();
   if (base instanceof Date) {
      base = +base;
   }
   delta = (baseCheckpointTimestamp - base) % checkpointLength;
   if (delta < 0) {
      delta = checkpointLength + delta;
   }
   delta = ~~(delta / 1000);
   sec = delta % 60;
   delta = ~~(delta / 60);
   min = delta % 60;
   hr = ~~(delta / 60);

   return {
      absolute: base + (hr*60*60*1000 + min*60*1000 + sec*1000),
      till: {
         hr: hr,
         min: min,
         sec: sec
      }
   };
}

function getCheckpointsAtDate(date) {
   var first = getNearestCheckpoint(date), result = [], next, end;

   end = new Date(+date);
   end.setDate(end.getDate() + 1);

   next = first.absolute;
   do {
      result.push(new Date(next));
      next += checkpointLength;
   } while(next < +end);

   return result;
}

function fmtDate(date) {
   return util.format('%s.%s.%s', zPad(date.getDate()), zPad(date.getMonth() + 1), date.getFullYear());
}

function fmtTime(date) {
   return util.format(
      '%s:%s',
      zPad(date.getHours()),
      zPad(date.getMinutes())
   );
}

app.use(require('body-parser').json());

poll(function(updates){
   var now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
   updates.forEach(function(update){

      if (!update.message.text) {
         return;
      }

      var
         msg = update.message,
         text = msg.text.toLowerCase().trim(),
         marker = 'бот когда отсечк',
         reDay = /в(?:о)? (понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)/i,
         reDate = /и ([0-9]{1,2}).([0-9]{1,2})(?:.([0-9]{2,4}))?/i,
         remainder, reply, base;

      text = text.replace(/\s+/g, ' ').replace(/[,?!-]/g, '');

      console.log('Got update. Chat: %s, user: %s, message: %s', msg.chat.id, msg.from.username, text);
      if (text.indexOf(marker) === 0) {

         remainder = text.substr(marker.length).trim();

         if (remainder) {
            if (remainder == 'а') {
               base = now;
            } else if (remainder == 'и') {
               base = getCheckpointsAtDate(today);
            } else if (remainder == 'и завтра') {
               base = getCheckpointsAtDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0));
            } else if (reDay.test(remainder)) {
               var dayStr = remainder.match(reDay)[0];
               base = null;
            } else if (reDate.test(remainder)) {
               var comps = remainder.match(reDate);
               var day = +comps[1];
               var mon = +comps[2];
               var year = +comps[3] || 2015;
               if (year < 100) {
                  year += 2000;
               }
               base = getCheckpointsAtDate(new Date(year, mon - 1, day, 0, 0, 0, 0));
            }
         }

         if (base instanceof Array) {
            reply = util.format('Отсечки %s:\n', fmtDate(base[0])) + base.reduce(function(res, d){
               res.push(fmtTime(d));
               return res;
            }, []).join(', ');
         } else if (base instanceof Date || typeof base == 'number') {
            base = getNearestCheckpoint(base);
            reply = util.format(
               'Ближайшая отсечка через %s:%s:%s',
               zPad(base.till.hr),
               zPad(base.till.min),
               zPad(base.till.sec));
         } else {
            reply = 'Я пока не могу ответить на этот вопрос...';
         }

         if (reply) {
            https.get(mkCallUrl('sendMessage', {
               chat_id: msg.chat.id,
               text: reply
            }));
         }

      }
   });
});

var server_port = process.env.OPENSHIFT_NODEJS_PORT || 8080;
var server_ip_address = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1';

app.listen(server_port, server_ip_address);

// Keep alive every 5 min
var http = require("http");
setInterval(function() {
   http.get("http://ingress-checkpoint-bot.herokuapp.com");
}, 300000);