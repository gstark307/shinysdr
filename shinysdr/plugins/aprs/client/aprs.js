// Copyright 2014, 2014 Kevin Reid <kpreid@switchb.org>
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

// TODO: May be using the wrong relative module id -- otherwise this should have ..s
define(['widgets', 'maps'], function (widgets, maps) {
  'use strict';
  
  var Block = widgets.Block;
  var BlockSet = widgets.BlockSet;
  
  var exports = {};
  
  function entryBuilder(setElement, block, name) {
    var container = setElement.appendChild(document.createElement('div'));
    container.className = 'frame';
    var toolbar = container.appendChild(document.createElement('div'));
    toolbar.className = 'panel frame-controls';
    
    // toolbar.appendChild(document.createTextNode('Station '));
    
    var label = document.createElement('span');
    label.textContent = name;
    toolbar.appendChild(label);
    
    return container.appendChild(document.createElement('div'));
  };
  var APRSInformationWidget = BlockSet(APRSStationWidget, entryBuilder);
  
  // TODO: Better widget-plugin system so we're not modifying should-be-static tables
  widgets['interface:shinysdr.plugins.aprs.IAPRSInformation'] = APRSInformationWidget;
  
  function APRSStationWidget(config) {
    Block.call(this, config, function (block, addWidget, ignore, setInsertion, setToDetails, getAppend) {
      ignore('address'); // in header
      addWidget('track', widgets.TrackWidget);  // TODO: Should be handled by type information instead
    }, false);
  }
  
  // TODO: Better widget-plugin system so we're not modifying should-be-static tables
  widgets['interface:shinysdr.plugins.aprs.IAPRSStation'] = APRSStationWidget;
  
  function addAPRSMapLayer(db, scheduler, index, addLayer, addModeLayer) {
    addLayer('APRS', {
      featuresCell: index.implementing('shinysdr.plugins.aprs.IAPRSStation'),
      featureRenderer: function renderStation(station, dirty) {
        return maps.renderTrackFeature(dirty, station.track,
          'a=' + station.address.depend(dirty) +
          ' st=' + station.status.depend(dirty) +
          ' sy=' + station.symbol.depend(dirty));
      }
    });
  }
  
  maps.register(addAPRSMapLayer);
  
  return Object.freeze(exports);
});
