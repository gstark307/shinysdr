// Copyright 2013, 2014 Kevin Reid <kpreid@switchb.org>
// 
// This file is part of ShinySDR.
// 
// ShinySDR is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// 
// ShinySDR is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
// 
// You should have received a copy of the GNU General Public License
// along with ShinySDR.  If not, see <http://www.gnu.org/licenses/>.

define(['./values', './events', './database', './network', './maps', './widget', './widgets', './audio', './window-manager'], function (values, events, database, network, maps, widget, widgets, audio, windowManager) {
  'use strict';
  
  function log(msg) {
    console.log(msg);
    document.getElementById('loading-information-text')
        .appendChild(document.createTextNode('\n' + msg));
  }
  
  var any = values.any;
  var ConstantCell = values.ConstantCell;
  var createWidgetExt = widget.createWidgetExt;
  var LocalCell = values.LocalCell;
  var makeBlock = values.makeBlock;
  var StorageCell = values.StorageCell;
  var StorageNamespace = values.StorageNamespace;
  var Index = values.Index;
  
  var scheduler = new events.Scheduler();
  
  var freqDB = new database.Union();
  freqDB.add(database.allSystematic);
  freqDB.add(database.fromCatalog('dbs/')); // TODO get url from server
  // kludge till we have proper UI for selection of write targets
  var writableDB = database.fromURL('wdb/');
  freqDB.add(writableDB);
  
  // TODO(kpreid): Client state should be more closely associated with the components that use it.
  var clientStateStorage = new StorageNamespace(localStorage, 'shinysdr.client.');
  function cc(key, type, value) {
    var cell = new StorageCell(clientStateStorage, type, key);
    if (cell.get() === null) {
      cell.set(value);
    }
    return cell;
  }
  var clientState = makeBlock({
    opengl: cc('opengl', Boolean, true),
    opengl_float: cc('opengl_float', Boolean, true),
    spectrum_split: cc('spectrum_split', new values.Range([[0, 1]], false, false), 0.5),
    spectrum_average: cc('spectrum_average', new values.Range([[0.05, 1]], true, false), 0.25)
  });
  var clientBlockCell = new ConstantCell(values.block, clientState);
  
  // TODO get url from server
  log('Loading plugins…');
  network.externalGet('/client/plugin-index.json', 'text', function gotPluginIndex(jsonstr) {
    var pluginIndex = JSON.parse(jsonstr);
    Array.prototype.forEach.call(pluginIndex.css, function (cssUrl) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = String(cssUrl);
      document.querySelector('head').appendChild(link);
    })
    requirejs(Array.prototype.slice.call(pluginIndex.js), function (plugins) {
      connectRadio();
    });
  });
  
  function connectRadio() {
    log('Connecting to server…');
    var firstConnection = true;
    connected.scheduler = scheduler;
    var remoteCell = network.connect(network.convertToWebSocketURL('radio'));
    remoteCell.n.listen(connected);

    var audioState = audio.connectAudio(network.convertToWebSocketURL('audio'));  // TODO get url from server

    function connected() {
      var radio = remoteCell.depend(connected);
      
      // Get mode from frequency DB
      function bandMode(freq) {
        var foundWidth = Infinity;
        var foundMode = null;
        freqDB.inBand(freq, freq).forEach(function(record) {
          var l = record.lowerFreq;
          var u = record.upperFreq;
          var bandwidth = Math.abs(u - l);  // should not be negative but not enforced, abs for robustness
          if (bandwidth < foundWidth) {
            foundWidth = bandwidth;
            foundMode = record.mode;
          }
        });
        return foundMode;
      }

      // Options
      //   receiver: optional receiver
      //   alwaysCreate: optional boolean (false)
      //   freq: float Hz
      //   mode: optional string
      function tune(options) {
        var alwaysCreate = options.alwaysCreate;
        var record = options.record;
        var freq = options.freq !== undefined ? +options.freq : (record && record.freq);
        // Note for mode selection that bandMode is only used if we are creating a receiver (below); this ensures that we don't undesirably change the mode on drag-tuning of an existing receiver. This is a kludge and should probably be replaced by (1) making a distinction between dragging a receiver and clicking elsewhere, (2) changing mode only if the receiver's mode was matched to the old band, or (3) changing mode on long jumps but not short ones.
        var mode = options.mode || (record && record.mode);
        var receiver = options.receiver;
        //console.log('tune', alwaysCreate, freq, mode, receiver);
      
        var receivers = radio.receivers.get();
        var fit = Infinity;
        if (!receiver && !alwaysCreate) {
          // Search for nearest matching receiver
          for (var recKey in receivers) {
            var candidate = receivers[recKey].get();
            if (!candidate.rec_freq) continue;  // sanity check
            var sameMode = candidate.mode.get() === mode;
            var thisFit = Math.abs(candidate.rec_freq.get() - freq) + (sameMode ? 0 : 1e6);
            if (thisFit < fit) {
              fit = thisFit;
              receiver = candidate;
            }
          }
        }
      
        if (receiver) {
          receiver.rec_freq.set(freq);
          if (mode && receiver.mode.get() !== mode) {
            receiver.mode.set(mode);
          }
        } else {
          // TODO less ambiguous-naming api
          receivers.create({
            mode: mode || bandMode(freq) || 'AM',
            rec_freq: freq
          });
          // TODO: should return stub for receiver or have a callback or something
        }
        
        return receiver;
      }
      Object.defineProperty(radio, 'tune', {
        value: tune,
        configurable: true,
        enumerable: false
      });
    
      // Kludge to let frequency preset widgets do their thing
      // TODO(kpreid): Make this explicitly client state instead
      radio.preset = new LocalCell(any, undefined);
      radio.preset.set = function(freqRecord) {
        LocalCell.prototype.set.call(this, freqRecord);
        tune({
          record: freqRecord
        });
      };
      
      if (firstConnection) {
        firstConnection = false;
        
        var everything = new ConstantCell(values.block, makeBlock({
          client: clientBlockCell,
          radio: remoteCell,
          audio: new ConstantCell(values.block, audioState)
        }));
      
        var index = new Index(scheduler, everything);
      
        var context = new widget.Context({
          // TODO all of this should be narrowed down, read-only, replaced with other means to get it to the widgets that need it, etc.
          widgets: widgets,
          radioCell: remoteCell,
          index: index,
          clientState: clientState,
          spectrumView: null,
          freqDB: freqDB,
          writableDB: writableDB,
          scheduler: scheduler
        });
      
        // generic control UI widget tree
        widget.createWidgets(everything, context, document);
        
        // Map (all geographic data)
        widget.createWidgetExt(context, maps.GeoMap, document.getElementById('map'), remoteCell);
      
        // Now that the widgets are live, show them
        document.body.classList.remove('main-not-yet-run');
        
        // globals for debugging / interactive programming purposes only
        window.DfreqDB = freqDB;
        window.DwritableDB = writableDB;
        window.DradioCell = remoteCell;
        window.Deverything = everything;
        window.Dindex = index;
      }
    }
  }
});