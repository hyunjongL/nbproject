/* notepaneView Plugin
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

      self.locs = null;
      self.element.addClass('minimapView')
      //.append("<div class='threadview-header'><div class='threadview-header-sectioninfo'/><div class='threadview-filter-controls'> <div class='nbicon questionicon' /><button class='mark-toggle' arg='add' action='question'>+</button><span class='n_question'>...</span><button class='mark-toggle' arg='remove' action='question'>-</button> <span id='thread_request_reply'>replies requested</span>  <!--<button class='mark-toggle' action='star'><div class='nbicon staricon-hicontrast' /><span class='n_star'>...</span><span id='thread_mark_favorite'>Mark as Favorite.</span></button>--></div></div><div class='threadview-pane'/>");
      self.minimapCanvas = document.createElement('canvas');
      self.minimapCanvas.id = "minimapCanvas"
      self.minimapCanvas.style.position="absolute"
      self.element[0].append(self.minimapCanvas)

      self.minimapScrollBar = document.createElement('div');
      self.minimapScrollBar.style.position="absolute"
      self.minimapScrollBar.style.border = "3px solid #000"
      self.minimapScrollBar.id = "scrollWindow"
      self.element[0].append(self.minimapScrollBar)

      self.element.closest('div.perspective').bind('resize_perspective', function (evt, directions) {
        self._render()
      });
      $(window).resize(self._render);
      window.onscroll = this.scrollHandler
      self.element.closest('div.pers-protection')

    },

    _defaultHandler: function (evt) {
    },

    scrollHandler: function(e){
      const scrollWindow = this.scrollWindow
      const totalHeight = $('body').height()
      const totalScroll = totalHeight - window.innerHeight
      const currentScroll = window.scrollY / totalScroll

      const barTotalScroll = scrollWindow.parentElement.offsetHeight - scrollWindow.offsetHeight
      scrollWindow.style.top = barTotalScroll * currentScroll + 'px'

      const minimapTotalScroll = this.minimapCanvas.offsetHeight - this.minimapCanvas.parentElement.offsetHeight
      console.log(this.minimapCanvas, '-' + minimapTotalScroll * currentScroll + 'px')
      this.minimapCanvas.style.top = '-' + minimapTotalScroll * currentScroll + 'px'
    },

    set_model: function (model) {
      var self = this;
      self._model =  model;
      var id_source = $.concierge.get_state('file');
      self._id_source =  id_source;
      model.register($.ui.view.prototype.get_adapter.call(this),  { location: null, seen: null, threadmark: null });

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
      if(this.documentHeight != documentHeight || this.documentWidth != documentWidth){
        this.minimapScrollBar.style.width = minimapWidth-3 + 'px'
        this.minimapScrollBar.style.height = (minimapWidth * window.innerHeight / mainWidth) + 'px'
        //ratio recalculation
        //redraw canvas from scratch
        const canvas = this.minimapCanvas
        const context = this.minimapCanvas.getContext('2d');
        context.clearRect(0, 0 , canvas.width, canvas.height)
        context.fillStyle = ""

        canvas.width = documentWidth
        canvas.height = documentHeight / 4
        canvas.style.width = minimapWidth + 'px'
        const ratio = documentHeight / documentWidth
        canvas.style.height = minimapWidth * ratio + 'px'

        // Draw Map
        context.fillStyle = "#dbdbdb"
        const paragraphs = $('p, header, h1, h2, h3, h4, h5, h6, li, strong, a')
        for(i=0;i<paragraphs.length;i++){
          const element = paragraphs[i]
          const position = $(element).offset()
          if($(element).parents('main').length < 1){
            continue;
          }
          if(i == 'length'){
            // console.log(position)
          }
          if(['H1', 'H2', 'H3', 'H4', 'STRONG'].includes(element.tagName)){
            context.fillStyle = "#909090"
          }else if(element.tagName == 'A'){
            console.log()
            context.fillStyle = "#337ab7"
          }else {
            context.fillStyle = "#dbdbdb"
          }
          context.fillRect(position.left, position.top / 4, element.offsetWidth, element.offsetHeight / 4 - 3)
        }

        context.fillStyle = "#212529"
        const images = $('img')
        for(i=0;i<images.length;i++){
          const element = images[i]
          const position = $(element).offset()
          if(i == 'length'){
            
            // console.log(position)
          }
          context.drawImage(element,position.left, position.top / 4, element.offsetWidth, element.offsetHeight / 4)
        }
        // Locate 

        //for all annotations
        for(i in this._model.o.html5location){
          var annot = this._model.o.html5location[i]
          getElementsByXPath(document, annot.path1)[0].style['border-color'] = 'red'
          $(getElementsByXPath(document, annot.path1)[0]).offset
        }
      }
      if(this.height != minimapHeight || this.width != minimapWidth){
        //canvas resize
        this.height = minimapHeight
        this.width = minimapWidth
      }

    },

    _render_one: function () {
    },

    update: function () {
      console.log("updated")
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
