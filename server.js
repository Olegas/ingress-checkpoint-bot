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

app.use(require('body-parser').json());

poll(function(updates){
   updates.forEach(function(update){

      console.log(JSON.stringify(update.message, null, 2));

      if (!update.message.text) {
         return;
      }

      var msg = update.message, text = msg.text.toLowerCase(), prefix = '';

      text = text.replace(/\s+/g, ' ').replace(/[,.-?!]/g, '');

      console.log('Got update. Chat: %s, user: %s, message: %s', msg.chat.id, msg.from.username, text);
      if (text == 'бот когда отсечка') {
         var delta = (baseCheckpointTimestamp - Date.now()) % checkpointLength;
         if (delta < 0) {
            delta = checkpointLength + delta;
         }
         delta = ~~(delta / 1000);
         var sec = delta % 60;
         delta = ~~(delta / 60);
         var min = delta % 60;
         var hr = ~~(delta / 60);
         console.log('%d %d %d', baseCheckpointTimestamp, Date.now(), delta);
         https.get(mkCallUrl('sendMessage', {
            chat_id: msg.chat.id,
            text: util.format('Ближайшая отсечка через %s:%s:%s', zPad(hr), zPad(min), zPad(sec))
         }));
      }
   });
});

app.listen(8080);