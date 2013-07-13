(function () {
  'use strict';
  
  var any = sdr.network.any;
  var xhrput = sdr.network.xhrput;
  
  var scheduler = new sdr.events.Scheduler();
  
  var freqDB = new sdr.database.Union();
  freqDB.add(sdr.database.allSystematic);
  freqDB.add(sdr.database.fromCatalog('/dbs/'));
  
  var radio;
  sdr.network.connect('/radio', function gotDesc(remote) {
    radio = remote;

    // Takes center freq as parameter so it can be used on hypotheticals and so on.
    function frequencyInRange(candidate, centerFreq) {
      var halfBandwidth = radio.input_rate.get() / 2;
      if (candidate < halfBandwidth && centerFreq === 0) {
        // recognize tuning for 0Hz gimmick
        return true;
      }
      var fromCenter = Math.abs(candidate - centerFreq) / halfBandwidth;
      return fromCenter > 0.01 && // DC peak
             fromCenter < 0.85;  // loss at edges
    }

    // Kludge to let frequency preset widgets do their thing
    radio.preset = new sdr.network.LocalCell(sdr.network.any);
    radio.preset.set = function(freqRecord) {
      sdr.network.LocalCell.prototype.set.call(this, freqRecord);
      var freq = freqRecord.freq;
      radio.mode.set(freqRecord.mode);
      if (!frequencyInRange(freq, radio.source.freq.get())) {
        if (freq < radio.input_rate.get() / 2) {
          // recognize tuning for 0Hz gimmick
          radio.source.freq.set(0);
        } else {
          //radio.source.freq.set(freq - 0.2e6);
          // left side, just inside of frequencyInRange's test
          radio.source.freq.set(freq + radio.input_rate.get() * 0.374);
        }
      }
      radio.receiver.rec_freq.set(freq);
    };
  
    // TODO better structure / move to server
    var _scanView = freqDB;
    radio.scan_presets = new sdr.network.Cell(any);
    radio.scan_presets.get = function () { return _scanView; };
    radio.scan_presets.set = function (view) {
      _scanView = view;
      this.n.notify();
    };
    
    // kludge till we have proper editing
    var writableDB = new sdr.database.Table();
    freqDB.add(writableDB);
    radio.targetDB = writableDB; // kludge reference
  
    var view = new sdr.widget.SpectrumView({
      scheduler: scheduler,
      radio: radio,
      element: document.querySelector('.hscalegroup') // TODO relic
    });
    
    var context = new sdr.widget.Context({
      radio: radio,
      spectrumView: view,
      freqDB: freqDB,
      scheduler: scheduler
    });
    
    sdr.widget.createWidgets(radio, context, document);
  }); // end gotDesc
}());