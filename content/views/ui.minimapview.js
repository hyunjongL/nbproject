/* minimapview Plugin
 * Depends:
 *    ui.core.js
 *     ui.view.js
 *

 Author
 cf AUTHORS.txt

 License
 Copyright (c) 2010-2012 Massachusetts Institute of Technology.
 MIT License (cf. MIT-LICENSE.txt or http://www.opensource.org/licenses/mit-license.php)
*/
/*global jQuery:true NB$:true*/
define(function(require) {
  var concierge       = require('concierge'),
      view            = require('view'),
      $               = require('jquery'),
      contextmenu     = require('contextmenu')

  var $str = NB$ ? 'NB$' : 'jQuery';
  var V_OBJ = $.extend({}, $.ui.view.prototype, {
    _f_location_seen: function (id_location) {
      var self = this;
      return function () {
        var m = self._model;
        var o = m.get('comment', { ID_location: id_location }).items;
        var i;
        var new_seen = {};
        for (i in o) {
          if (!(i in m.o.seen)) {
            new_seen[i] = { id: i, id_location: id_location };
            $.concierge.logHistory('seen', i);
          }
        }
        self._model.add('seen', new_seen);
      };
    },

    _create: function () {
      $.ui.view.prototype._create.call(this);
      var self = this;
      self._pages =  {}; //pages that have been rendered
      self._maxpage =  0; //last (i.e. max page number of) page that has been rendered
      self._page = null;
      self._scrollTimerID = null;
      self._seenTimerID = null;
      self._id_location = null; //location_id of selected thread
      self._is_first_stroke = true;
      self._rendered = false;
      self._filters = { me: false, star: false, question: false, advanced: false, emoticon: false };
      self.QUESTION = null;
      self.STAR = null;
      self._selected_locs = { all: [], top: [] };
      self._mode_select = false;
      self._export_id = null;
      self.width = 0;
      self.height = 0;
      self.documentHeight = 0;
      self.documentWidth = 0;
      self.maxAnnots = 1;
      self.emotes = [];

      self.locs = null;
      self.element.addClass('minimapView')      

      self.minimapDiv = document.createElement('div');
      self.minimapDiv.id = "minimapDiv"
      self.minimapDiv.style.position = "absolute"
      self.element[0].append(self.minimapDiv)

      // Scroll bar that shows position of user in document.
      self.minimapScrollBar = document.createElement('div');
      self.minimapScrollBar.style.position="absolute"
      self.minimapScrollBar.style.border = "2px solid #000"
      self.minimapScrollBar.style["pointer-events"] = "none"
      self.minimapScrollBar.id = "scrollWindow"
      self.element[0].append(self.minimapScrollBar)



      self.element.closest('div.perspective').bind('resize_perspective', function (evt, directions) {
        self._render()
      });
      $(window).resize(self._render);

      // Scroll trigger is handled regularly rather than on action because onScroll is called excessively.

      this.scrolling = false
      $(window).scroll(function(){
        this.scrolling = true
      })
      setInterval(this.scrollHandler, 20)

      self.element.closest('div.pers-protection')
      this.commentElements = {}
      this.html5locationNum = 0

    }, 

    _defaultHandler: function (evt) {
    },

    scrollHandler: function(e){
      if(!this.scrolling){
        return;
      }
      this.scrolling = false
      const scrollWindow = this.scrollWindow
      const totalHeight = $('body').height()
      const totalScroll = totalHeight - window.innerHeight
      const currentScroll = window.scrollY / totalScroll

      const barTotalScroll = scrollWindow.parentElement.offsetHeight - scrollWindow.offsetHeight
      scrollWindow.style.top = barTotalScroll * currentScroll + 'px'

      const minimapTotalScroll = this.minimapDiv.offsetHeight - this.minimapDiv.parentElement.offsetHeight
      this.minimapDiv.style.top = '-' + minimapTotalScroll * currentScroll + 'px'
    },

    set_model: function (model) {
      var self = this;
      self._model =  model;
      var id_source = $.concierge.get_state('file');
      self._id_source =  id_source;
      model.register($.ui.view.prototype.get_adapter.call(this),  { location: null, seen: null, threadmark: null });
      return;
    },

    draw_all_children: function(divs, depth) {
      // Called recursively to draw all elements

      for(topic of divs){
        if(topic.id.startsWith("section") || topic.id == "definition"){
          this.draw_elem_in_minimap(topic, depth, "rgba(0,0,0,0)")
          var secondLevelDivs = $(topic).children('div')
          this.draw_all_children(secondLevelDivs, depth + 1)
        }
      }
    },

    draw_elem_in_minimap: function(element, depth, color) {
      // process one element and draw it on the map
      // Depth gives the element a few pixels left margin to show hierarchy
      const documentWidth = $('body')[0].offsetWidth
      const documentHeight = $('body')[0].offsetHeight
      const minimapHeight = this.element[0].offsetHeight
      const minimapWidth = this.element[0].offsetWidth
      const mainWidth = $('main')[0].offsetWidth
      const minimapRatio = minimapWidth / mainWidth

      const position = $(element).offset()
      if($(element).parents('main').length < 1){
        return;
      }
      var newElem = document.createElement('div')
      newElem.style.height = element.offsetHeight * minimapRatio - 4 + 'px'
      newElem.style.width = element.offsetWidth * minimapRatio - depth * minimapWidth * 0.02 - 1 + 'px'
      const hTags = 'h1, h2, h3, h4, h5, h6'
      var hElem = $(element).children(hTags).length > 0 ? $(element).children(hTags)[0] : null

      var textElem
      if(hElem){
        textElem = document.createElement('p')
        textElem.innerText = $.trim(hElem.innerText)
        textElem.style.marginTop = "0px"
        textElem.style['font-size'] = '1px'
        textElem.style['font-family'] = 'sans-serif'
        textElem.style.color = "#4F6367"
        textElem.style['word-spacing'] = '-0.5px'
        newElem.appendChild(textElem)
      }
      if(element.id == "definition"){
        textElem = document.createElement('p')
        textElem.innerText = $.trim($(element).children(".boxtitle")[0].innerText)
        textElem.style['font-size'] = '1px'
        textElem.style['font-family'] = 'sans-serif'
        textElem.style.color = "#4F6367"
        textElem.style.marginTop = "0px"
        textElem.style['word-spacing'] = '-0.5px'
        newElem.appendChild(textElem)
      }
      $(textElem).addClass("minimapTitle")
      // $(textElem).style("margin",  "0 !important", "important")
      
      newElem.style.backgroundColor = color
      newElem.style.position = 'absolute'
      newElem.style.top = position.top * minimapRatio + 2 + 'px'
      newElem.style.left = depth * minimapWidth * 0.02 + 1 + 'px'
      newElem.style["border-left"] = "1px solid black"

      // visual feedback for mouse hover
      $(newElem).mouseenter(function(elem, docuElem){
        elem.style.backgroundColor = "rgba(255,255,255,0.3)"
        if(this.selected != docuElem){
          docuElem.style.backgroundColor = ""
        }
      }.bind(this, newElem, element))

      $(newElem).mouseleave(function(elem, fillStyle, docuElem){
        elem.style.backgroundColor = fillStyle
        if(this.selected != docuElem){
          docuElem.style.backgroundColor = ""
        }else{
          docuElem.style.border = "grey solid 1px"

        }
      }.bind(this, newElem, color, element))

      // on click, move to where the element is located on the document
      newElem.style.cursor = "pointer"
      $(newElem).click(function(elem, top, e) {
        if(this.selected){
          this.selected.style.backgroundColor = ""
        }
        $("HTML, BODY").animate({ scrollTop: top }, 300);
        // docuElem.style.border = "grey solid 1px"
        this.selected = elem
      }.bind(this, element, position.top))

      minimapDiv.append(newElem)
    },

    _render: function () {
      var self = this;
      const documentWidth = $('body')[0].offsetWidth
      const documentHeight = $('body')[0].offsetHeight
      const minimapHeight = this.element[0].offsetHeight
      const minimapWidth = this.element[0].offsetWidth
      const mainWidth = $('main')[0].offsetWidth
      const emotes = ['#interested', '#curious', '#question', '#confused', '#idea', '#frustrated', '#help', '#useful']

      // Number of html5 locations
      html5locationNum = Object.keys(this._model.o.html5location).length

      // Below code calculates the distribution of emotes/hashtags in the document.
      // It uses the html5location of an annotation and calculates based on it.
      // It may be changed to capture a closest parent element in map and show data on the map.
      // ***************************************************************************************
      // if(html5locationNum != this.calculatedNum){
      //   this.emotes = []
      //   var location, body;
      //   this.calculatedNum = html5locationNum
      //   var i = 0;
      //   for(i in this._model.o.html5location){
      //     var annot = this._model.o.html5location[i]
      //     if(annot.path1 in this.commentElements){
      //       this.commentElements[annot.path1].numAnnots += 1
      //     }else{
      //       this.commentElements[annot.path1] = {numAnnots: 1, emotes: {curious: 0, interested: 0, question: 0, confused: 0, idea: 0, frustrated: 0, help: 0, useful: 0}}
      //     }
      //     body = this._model.o.location[annot.id_location].body

      //     for(var j=0; j<emotes.length; j++){
      //       const emote = emotes[j]
      //       if(body.indexOf(emote) > 0){
      //         this.commentElements[annot.path1].emotes[emote.substring(1)] += 1
      //       }
      //     }
      //     if(this.commentElements[annot.path1].numAnnots > this.maxAnnots){
      //       this.maxAnnots = this.commentElements[annot.path1].numAnnots
      //     }
      //     this.commentElements[annot.path1].emotesSorted = Object.keys(this.commentElements[annot.path1].emotes).sort((a, b)=>{
      //       return this.commentElements[annot.path1].emotes[b] - this.commentElements[annot.path1].emotes[a]
      //     })
      //   }
      // }
      // ***************************************************************************************


      if(this.documentHeight != documentHeight || this.documentWidth != documentWidth){
        // If resized, redraw canvas from scratch

        // ratio recalculation
        this.minimapScrollBar.style.width = minimapWidth - 7 + 'px'
        this.minimapScrollBar.style.height = (minimapWidth * window.innerHeight / mainWidth) + 'px'

        canvas.width = documentWidth
        canvas.height = documentHeight / 4
        canvas.style.width = minimapWidth + 'px'
        const ratio = documentHeight / documentWidth
        canvas.style.height = minimapWidth * ratio + 'px'

        const minimapDiv = this.minimapDiv
        $(minimapDiv).empty()
        minimapDiv.style.height = minimapWidth * ratio + 'px'
        minimapDiv.style.width = minimapWidth + 'px'
        minimapDiv.style["background-color"] = "#B8D8D8"
        const minimapRatio = minimapWidth / mainWidth

        const firstLevelDivs = $('.mt-content-container').children('div')
        this.draw_all_children(firstLevelDivs, 1)

        // Draw small images on map.
        // This helps the map look more like a miniature of the document.
        const images = $('img')
        for(i=0;i<images.length;i++){
          const element = images[i]
          if($(element).parents('main').length < 1
            || element.src == "https://a.mtstatic.com/@public/production/site_4463/1474922585-logo.png"){
            // https://a.mtstatic.com/@public/production/site_4463/1474922585-logo.png --> removed the logo because it was too big
            continue;
          }
          const position = $(element).offset()
          var newElem = document.createElement('img')
          newElem.src = element.src
          newElem.style.height = element.offsetHeight * minimapRatio - 2 + 'px'
          newElem.style.width = element.offsetWidth * minimapRatio - 2 + 'px'
          newElem.style.position = 'absolute'
          newElem.style.top = position.top * minimapRatio + 4 + 'px'
          newElem.style.left = position.left * minimapRatio + 4 + 'px'
          minimapDiv.append(newElem)
        }
        
        var elem, position, score;
      }else if(this.height != minimapHeight || this.width != minimapWidth){
        // save minimap info
        this.height = minimapHeight
        this.width = minimapWidth
      }

    },

    _render_one: function () {
    },

    update: function () {
      this._render()
      return
    },
  });
  var getElementsByXPath = function (doc, xpath) {
    var nodes = [], result, item;

    try {
      result = doc.evaluate(xpath, doc, null, XPathResult.ANY_TYPE, null);
      for (item = result.iterateNext(); item; item = result.iterateNext()) {
      nodes.push(item);}

      if (nodes.length === 0) {
        //try a hack to handle namespace defaults in xhtml documents
        xpath = xpath.replace(/\/([a-z])/ig, '/my:$1');
        result = doc.evaluate(xpath, doc, function () {
          return document.body.namespaceURI;
        }, XPathResult.ANY_TYPE, null);
        for (item = result.iterateNext(); item; item = result.iterateNext()) {
        nodes.push(item);}
      }
    }
    catch (exc) {
      // Invalid xpath expressions make their way here sometimes.  If that happens,
      // we still want to return an empty set without an exception.
    }

    return nodes;
  };
  $.widget('ui.minimapView', V_OBJ);
  $.ui.minimapView.prototype.options = {
    loc_sort_fct: function (o1, o2) {return o1.top - o2.top;},

    listens: {
      resize_perspective: this.update,
      page: null,
      note_hover: null,
      note_out: null,
      select_thread: null,
      warn_page_change: null,
      keydown: null,
      filter_toggle: null,
      filter_threads: null,
      filter_emoticons: null,
      export_threads: null,
    },
  };
});
