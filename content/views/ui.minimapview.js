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

      self.minimapCanvas = document.createElement('canvas');
      self.minimapCanvas.id = "minimapCanvas"
      self.minimapCanvas.style.position="absolute"
      self.element[0].append(self.minimapCanvas)
      self.minimapCanvas.style['pointer-events'] = 'none'


      self.minimapScrollBar = document.createElement('div');
      self.minimapScrollBar.style.position="absolute"
      self.minimapScrollBar.style.border = "2px solid #000"
      // self.minimapScrollBar.style.backgroundColor = "rgba(100,100,100,0.3)"
      self.minimapScrollBar.style["pointer-events"] = "none"
      self.minimapScrollBar.id = "scrollWindow"
      self.element[0].append(self.minimapScrollBar)



      self.element.closest('div.perspective').bind('resize_perspective', function (evt, directions) {
        self._render()
      });
      $(window).resize(self._render);
      // window.onscroll = this.scrollHandler
      this.scrolling = false
      $(window).scroll(function(){
        this.scrolling = true
      })
      // $(window).scroll(this.scrollHandler)
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
      this.minimapCanvas.style.top = '-' + minimapTotalScroll * currentScroll + 'px'
      this.minimapDiv.style.top = '-' + minimapTotalScroll * currentScroll + 'px'
    },

    set_model: function (model) {
      var self = this;
      self._model =  model;
      var id_source = $.concierge.get_state('file');
      self._id_source =  id_source;
      model.register($.ui.view.prototype.get_adapter.call(this),  { location: null, seen: null, threadmark: null });
      //for all annotations
      return;
      //make placeholders for each page:
      var f = model.o.file[id_source];
      var $pane = $('div.notepaneView-pages', self.element);
      $pane.scroll(function (evt) {
        var timerID = self._scrollTimerID;
        if (timerID !== null) {
          window.clearTimeout(timerID);
        }

        timerID = window.setTimeout(function () {
          //Are we within 20px from the bottom of scrolling ?
          while ($pane.children().last().offset().top - $pane.offset().top - $pane.height() < 20) {
            var maxpage = self._maxpage;
            $.L('scroll: maxpage=' + maxpage);
            if (maxpage < f.numpages) {
              self._render_one(maxpage + 1);
            }            else {
              return; //last page has been rendered.
            }
          }
        }, 300);

        self._scrollTimerID =  timerID;
      });

      for (var i = 1; i <= f.numpages; i++) {
        $pane.append("<div class='notepaneView-comments' page='" + i + "'/>");
      }

      self._update();
    },
    draw_all_children: function(divs, depth) {
      for(topic of divs){
        if(topic.id.startsWith("section") || topic.id == "definition"){
          this.draw_elem_in_minimap(topic, depth, "rgba(0,0,0,0)")
          var secondLevelDivs = $(topic).children('div')
          this.draw_all_children(secondLevelDivs, depth + 1)
        }
      }
    },
    draw_elem_in_minimap: function(element, depth, color) {
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
      newElem.style.height = element.offsetHeight * minimapRatio - 1 + 'px'
      newElem.style.width = element.offsetWidth * minimapRatio - depth + 'px'
      const hTags = 'h1, h2, h3, h4, h5, h6'
      var hElem = $(element).children(hTags).length > 0 ? $(element).children(hTags)[0] : null
      console.log(hElem)
      // var h2Elem = $(element).children('h2').length > 0 ? $(element).children('h2')[0] : null
      // var h3Elem = $(element).children('h3').length > 0 ? $(element).children('h3')[0] : null
      // var h4Elem = $(element).children('h4').length > 0 ? $(element).children('h4')[0] : null
      var textElem
      if(hElem){
        textElem = document.createElement('p')
        textElem.innerText = $.trim(hElem.innerText)
        textElem.style.marginTop = "0px"
        textElem.style['font-size'] = '1px'
        textElem.style.color = "#4F6367"
        newElem.appendChild(textElem)
      }
      if(element.id == "definition"){
        textElem = document.createElement('p')
        textElem.innerText = $.trim($(element).children(".boxtitle")[0].innerText)
        textElem.style['font-size'] = '1px'
        textElem.style.color = "#4F6367"
        textElem.style.marginTop = "0px"
        newElem.appendChild(textElem)
      }
      $(textElem).addClass("minimapTitle")
      // $(textElem).style("margin",  "0 !important", "important")
      
      newElem.style.backgroundColor = color
      newElem.style.position = 'absolute'
      newElem.style.top = position.top * minimapRatio + 2 + 'px'
      newElem.style.left = 2 * depth + 'px'
      newElem.style["border-left"] = "1px solid black"
      newElem.style.marginBottom = "2px"

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
      /*
       * this is where we implement the caching strategy we want...
       */
      var self = this;
      const documentWidth = $('body')[0].offsetWidth
      const documentHeight = $('body')[0].offsetHeight
      const minimapHeight = this.element[0].offsetHeight
      const minimapWidth = this.element[0].offsetWidth
      const mainWidth = $('main')[0].offsetWidth
      const emotes = ['#interested', '#curious', '#question', '#confused', '#idea', '#frustrated', '#help', '#useful']

      html5locationNum = Object.keys(this._model.o.html5location).length
      if(html5locationNum != this.calculatedNum){
        // console.log(this._model.o)
        this.emotes = []
        var location, body;
        this.calculatedNum = html5locationNum
        var i = 0;
        for(i in this._model.o.html5location){
          var annot = this._model.o.html5location[i]
          if(annot.path1 in this.commentElements){
            this.commentElements[annot.path1].numAnnots += 1
          }else{
            this.commentElements[annot.path1] = {numAnnots: 1, emotes: {curious: 0, interested: 0, question: 0, confused: 0, idea: 0, frustrated: 0, help: 0, useful: 0}}
          }
          body = this._model.o.location[annot.id_location].body
          // body = this._model.o.comment
          // if(body.indexOf('#interested') > 0){
          //   this.commentElements[annot.path1].emotes.interested
          // }
          for(var j=0; j<emotes.length; j++){
            const emote = emotes[j]
            if(body.indexOf(emote) > 0){
              // console.log($('span[id_item=' + this._model.o.location[annot.id_location].ID + ']'))
              // this.emotes.push({elem: $('span[id_item=' + this._model.o.location[annot.id_location].ID + ']')[0], emote: emote})
              this.commentElements[annot.path1].emotes[emote.substring(1)] += 1
            }
          }
          if(this.commentElements[annot.path1].numAnnots > this.maxAnnots){
            this.maxAnnots = this.commentElements[annot.path1].numAnnots
          }
          this.commentElements[annot.path1].emotesSorted = Object.keys(this.commentElements[annot.path1].emotes).sort((a, b)=>{
            return this.commentElements[annot.path1].emotes[b] - this.commentElements[annot.path1].emotes[a]
          })

        }
      }
      console.log(this.emotes)
      if(this.documentHeight != documentHeight || this.documentWidth != documentWidth){
        this.minimapScrollBar.style.width = minimapWidth - 7 + 'px'
        this.minimapScrollBar.style.height = (minimapWidth * window.innerHeight / mainWidth) + 'px'
        //ratio recalculation
        //redraw canvas from scratch
        const canvas = this.minimapCanvas
        const context = this.minimapCanvas.getContext('2d');
        context.clearRect(0, 0 , canvas.width, canvas.height)
        context.fillStyle = "rgba(255, 255, 0, 0.5)"

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

        /*
        // Draw Map (hover/clickable divs of minimap)
        var fillStyle = "#dbdbdb"
        // context.fillStyle = "#dbdbdb"
        const paragraphs = $('p, header, h1, h2, h3, h4, h5, h6, ol, ul')
        for(i=0;i<paragraphs.length;i++){
          const element = paragraphs[i]
          const position = $(element).offset()
          if($(element).parents('main').length < 1){
            continue;
          }
          if(i == 'length'){
            // console.log(position)
          }
          if(['H1', 'H2', 'H3', 'H4'].includes(element.tagName)){
            fillStyle = "#909090"
          }else{
            fillStyle = "#dbdbdb"
          }
          // context.fillRect(position.left, position.top / 4, element.offsetWidth, element.offsetHeight / 4 - 3)
          var newElem = document.createElement('div')
          newElem.style.height = element.offsetHeight * minimapRatio - 1 + 'px'
          newElem.style.width = element.offsetWidth * minimapRatio - 1 + 'px'
          newElem.style.backgroundColor = fillStyle
          newElem.style.position = 'absolute'
          newElem.style.top = position.top * minimapRatio + 2 + 'px'
          newElem.style.left = position.left * minimapRatio + 2 + 'px'
          $(newElem).mouseenter(function(elem, docuElem){
            elem.style.backgroundColor = "rgba(255,255,255,0.3)"
            if(this.selected != docuElem){
              docuElem.style.backgroundColor = "#dbdbdb"
            }
          }.bind(this, newElem, element))

          $(newElem).mouseleave(function(elem, fillStyle, docuElem){
            elem.style.backgroundColor = fillStyle
            if(this.selected != docuElem){
              docuElem.style.backgroundColor = ""
            }else{
              docuElem.style.border = "grey solid 1px"

            }
          }.bind(this, newElem, fillStyle, element))

          $(newElem).click(function(elem, top, e) {
            if(this.selected){
              this.selected.style.backgroundColor = ""
            }
            $("HTML, BODY").animate({ scrollTop: top }, 300);
            docuElem.style.border = "grey solid 1px"
            this.selected = elem
          }.bind(this, element, position.top))

          minimapDiv.append(newElem)
        }
        */
        const firstLevelDivs = $('.mt-content-container').children('div')
        this.draw_all_children(firstLevelDivs, 1)
        // for(topic of firstLevelDivs){

        //   this.draw_elem_in_minimap(topic, 1, "#7A9E9F")
        //   var secondLevelDivs = $(topic).children('div')
        //   for(specific of secondLevelDivs){
        //     this.draw_elem_in_minimap(specific, 0.8, "#EEF5DB")
        //   }
          
        // }

        // Draw images on the minimap.
        // context.fillStyle = "#212529"
        const images = $('img')
        for(i=0;i<images.length;i++){
          const element = images[i]
          if($(element).parents('main').length < 1
            || element.src == "https://a.mtstatic.com/@public/production/site_4463/1474922585-logo.png"){
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
          // context.drawImage(element,position.left, position.top / 4, element.offsetWidth, element.offsetHeight / 4)
        }
        
        var elem, position, score;
        const test = {}
        // for(i in this.commentElements){
        //   context.fillStyle = "rgba(225, 225, 0, 0.7)"
        //   elem = getElementsByXPath(document, i)[0]
        //   position = $(elem).offset()
        //   score = this.commentElements[i].numAnnots / this.maxAnnots
        //   if(!position || elem.offsetHeight > 500){
        //     continue;
        //   }
        //   test[i] = elem.offsetHeight
        //   context.fillRect(position.left, position.top / 4, canvas.width * score, elem.offsetHeight / 4)
        //   // console.log('conf', this.commentElements[i].emotes)
        //   // if(this.commentElements[i].emotes['confused'] > 0){
        //   //   console.log(i, 'confused')
        //   //   context.fillStyle = "rgba(225, 0, 0, 1)"
        //   //   context.fillRect(position.left + elem.offsetWidth - 8, position.top / 4, 15, elem.offsetHeight / 4)
        //   //   elem.style['border-right'] = '3px solid red'
        //   // }
        // }
        const sorted = Object.keys(test).sort((a, b)=>test[b]-test[a])
      }else if(this.height != minimapHeight || this.width != minimapWidth){
        //canvas resize
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
