'use strict';

var DiagramFactory = function(DC, Shape, Label, Step, Link, Subflow, Note, Marquee, Selection, Toolbox) {
    var Diagram = function(canvas, dialog, process, implementors, imgBase, editable, instance, activity, instanceEdit, data) {
    Shape.call(this, this, process);
    this.canvas = canvas;
    this.dialog = dialog;
    this.process = process;
    this.implementors = implementors;
    this.imgBase = imgBase;
    this.editable = editable && editable.toString() === 'true';
    this.instance = instance;
    this.workflowType = 'process';
    this.isDiagram = true;
    this.context = this.canvas.getContext("2d");
    this.anchor = -1;
    this.drawBoxes = process.attributes.NodeStyle == 'BoxIcon';
    this.selection = new Selection(this);
    if (activity) {
      if (instance)
        this.activityInstanceId = activity;
      else
        this.activityId = activity;
    }
    this.instanceEdit = instanceEdit && instanceEdit.toString() === 'true';
    this.data = data;

    // zoom setup
    this.zoom = 100;
    var zoomControls = document.getElementsByClassName('mdw-workflow-zoom');
    if (zoomControls.length === 1) {
      var diagram = this;
      this.zoomControl = zoomControls[0];
      if (this.editable && Toolbox) {
        this.zoomControl.style.top = "90px";
        this.zoomControl.style.right = '270px';
      }
      var rangeInput = diagram.zoomControl.getElementsByTagName('input')[0];
      this.zoomControl.oninput = function(e) {
        diagram.zoomCanvas(parseInt(e.target.value));
      };
      this.zoomControl.onchange = function(e) {
        diagram.adjustSection();
      };
      this.zoomControl.onclick = function(e) {
        e.preventDefault();
        if (e.target.className) {
          if (e.target.className.endsWith('zoom-in') && diagram.zoom < 200) {
            diagram.zoomCanvas(diagram.zoom + 20);
            rangeInput.value = diagram.zoom + 20;
            diagram.adjustSection();
          }
          else if (e.target.className.endsWith('zoom-out') && diagram.zoom > 20) {
            diagram.zoomCanvas(diagram.zoom - 20);
            rangeInput.value = diagram.zoom - 20;
            diagram.adjustSection();
          }
        }
      };
      // zoom hover title
      rangeInput.onmousemove = function(e) {
        var rect = rangeInput.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var pct = (x / rangeInput.clientWidth) * 100;
        var z = parseInt(rangeInput.min) + (parseInt(rangeInput.max) - parseInt(rangeInput.min)) * pct / 100;
        if (z > (diagram.zoom - 10) && z < (diagram.zoom + 10)) {
          z = diagram.zoom;
        }
        rangeInput.title = Math.round(z) + '%';
      };
      // show/hide/close
      var closeBtn = this.zoomControl.getElementsByClassName('mdw-close')[0];
      this.zoomControl.onmouseover = function(e) {
        closeBtn.style.visibility = 'visible';
      };
      this.zoomControl.onmouseout = function(e) {
        closeBtn.style.visibility = 'hidden';
      };
      closeBtn.onclick = function(e) {
        diagram.zoomControl.style.visibility = 'hidden';
        this.style.visibility = 'hidden';
      };
      // pinch gesture
      window.addEventListener('wheel', function(e) {
        if (e.ctrlKey) {
          e.preventDefault();
          var z = diagram.zoom - e.deltaY;
          if (z < 20)
            z = 20;
          else if (z > 200)
            z = 200;
          diagram.zoomCanvas(z);
          rangeInput.value = diagram.zoom;
          diagram.adjustSection();
        }
      }, {passive: false});
    }
  };

  Diagram.prototype = new Shape();

  Diagram.BOUNDARY_DIM = 25;
  Diagram.ANIMATION_SPEED = 8; // segments / s;
  Diagram.ANIMATION_LINK_FACTOR = 3; // relative link slice

  Diagram.prototype.zoomCanvas = function(zoom) {
    this.zoom = zoom;
    var scale = zoom / 100;
    var dw = this.canvas.width * scale - this.canvas.width;
    var dh = this.canvas.height * scale - this.canvas.height;
    var dpRatio = window.devicePixelRatio || 1;
    this.canvas.style.transform = 'translate(' + (dw / (2 * dpRatio)) + 'px,' + (dh / (2 * dpRatio)) + 'px) scale(' + scale + ')';
  };

  // adjust section to accommodate zoomed canvas
  Diagram.prototype.adjustSection = function() {
    var mdwSections = document.getElementsByClassName('mdw-section');
    if (mdwSections.length) {
      var section = mdwSections[0];
      var scale = this.zoom / 100;
      var cw = this.canvas.style.width.substring(0, this.canvas.style.width.length - 2);
      var w =  (cw ? parseInt(cw) : this.canvas.width) * scale;  // canvas style width not populated on windows
      var mdwPanels = document.getElementsByClassName('mdw-panel-full-width');
      if (mdwPanels.length) {
        // don't shrink width smaller than original panel width
        if (!this.origPanelWidth)
          this.origPanelWidth = mdwPanels[0].offsetWidth;
        if (w < this.origPanelWidth - 37)
          w = this.origPanelWidth - 37;
      }
      var ch = this.canvas.style.height.substring(0, this.canvas.style.height.length - 2);
      var h = (ch ? parseInt(ch) : this.canvas.height) * scale;
      if (h < 540)
        h = 540;
      section.style.width = (w + 20) + 'px';
      section.style.height = (h + 20) + 'px';
    }
  };

  Diagram.prototype.draw = function(animate) {

    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.prepareDisplay();
    var diagram = this;

    this.label.draw();
    var highlighted = null;
    if (animate && !this.instance) {
      var sequence = this.getSequence();
      let i = 0;
      var totalTime = sequence.length * 1000 / Diagram.ANIMATION_SPEED;
      var linkCt = 0;
      var nonLinkCt = 0;
      sequence.forEach(function(it) {
        if (it instanceof Link)
          linkCt++;
        else
          nonLinkCt++;
      });
      var nonLinkSlice = totalTime / (nonLinkCt + 2 * linkCt);
      var linkSlice = Diagram.ANIMATION_LINK_FACTOR * nonLinkSlice;
      var timeSlice = nonLinkSlice;
      var s = function() {
        var it = sequence[i];
        it.draw(timeSlice);
        if (it instanceof Step && it.workflowItem.id === diagram.activityId) {
          it.highlight();
          highlighted = it;
        }
        diagram.scrollIntoView(it, timeSlice);
        i++;
        if (i < sequence.length) {
          var nextSlice = sequence[i] instanceof Link ? linkSlice : nonLinkSlice;
          setTimeout(s, timeSlice);
          timeSlice = nextSlice;
        }
        else if (highlighted) {
          diagram.scrollIntoView(highlighted, nonLinkSlice);
        }
      };
      s();
    }
    else {
      // draw quickly
      this.steps.forEach(function(step) {
        step.draw();
        if (step.workflowItem.id === diagram.activityId) {
          step.highlight();
          highlighted = step;
        }
      });
      this.links.forEach(function(link) {
        link.draw();
      });
      this.subflows.forEach(function(subflow) {
        subflow.draw();
      });
      if (highlighted) {
        this.scrollIntoView(highlighted, diagram.activityId ? 0 : 500);
      }
    }

    if (this.instance) {
      this.applyState(animate, function() {
        diagram.notes.forEach(function(note) {
          note.draw();
        });
        if ($mdwWebSocketUrl && $mdwWebSocketUrl !== '${mdwWebSocketUrl}') {
          const socket = new WebSocket($mdwWebSocketUrl);
          socket.addEventListener('open', function(event) {
             socket.send(diagram.instance.id);
          });
          socket.addEventListener('message', function(event) {
            var message = JSON.parse(event.data);
            if (message.subtype === 'a') {
              var step = diagram.getStep('A' + message.id);
              if (step) {
                if (!step.instances)
                  step.instances = [];
                var actInst = step.instances.find(function(inst) {
                  return inst.id === message.instId;
                });
                if (actInst) {
                  actInst.statusCode = message.status;
                }
                else {
                  var ai = {
                    activityId: message.id,
                    id: message.instId,
                    statusCode: message.status
                  };
                  step.instances.push(ai);
                  diagram.instance.activities.push(ai);
                }
                step.draw();
                diagram.scrollIntoView(step);
              }
            }
            else if (message.subtype === 't') {
              var link = diagram.getLink('T' + message.id);
              if (link) {
                if (!link.instances)
                  link.instances = [];
                var linkInst = link.instances.find(function(inst) {
                  return inst.id === message.instId;
                });
                if (linkInst) {
                  linkInst.statusCode = message.status;
                }
                else {
                  link.instances.push({
                    transitionId: message.id,
                    id: message.instId,
                    statusCode: message.status
                  });
                }
                link.draw();
                diagram.scrollIntoView(link);
              }
            }
          });
        }
      });
    }
    else if (this.data) {
      this.applyData();
    }
    else {
      diagram.notes.forEach(function(note) {
        note.draw();
      });
    }

    if (this.marquee) {
      this.marquee.draw();
    }
  };

  // sets display fields and returns a display with w and h for canvas size
  // (for performance reasons, also initializes steps/links arrays and activity impls)
  Diagram.prototype.prepareDisplay = function() {
    var canvasDisplay = { w: 640, h: 480 };

    var diagram = this; // forEach inner access

    // label
    var label = this.instance && this.instance.template ? this.instance.packageName + '/' + this.instance.processName : this.process.name;
    var font = this.instance && this.instance.template ? DC.TEMPLATE_FONT : DC.TITLE_FONT;
    diagram.label = new Label(this, label, this.getDisplay(), font);
    if (this.process.instanceId)
      diagram.label.subtext = this.process.instanceId;
    diagram.makeRoom(canvasDisplay, diagram.label.prepareDisplay());

    // activities
    diagram.steps = [];
    if (this.process.activities) {
      this.process.activities.forEach(function(activity) {
        var step = new Step(diagram, activity);
        step.implementor = diagram.getImplementor(activity.implementor);
        diagram.makeRoom(canvasDisplay, step.prepareDisplay());
        diagram.steps.push(step);
      });
    }

    // transitions
    diagram.links = [];
    diagram.steps.forEach(function(step) {
      if (step.activity.transitions) {
        step.activity.transitions.forEach(function(transition) {
          var link = new Link(diagram, transition, step, diagram.getStep(transition.to));
          diagram.makeRoom(canvasDisplay, link.prepareDisplay());
          diagram.links.push(link);
        });
      }
    });

    // embedded subprocesses
    diagram.subflows = [];
    if (this.process.subprocesses) {
      this.process.subprocesses.forEach(function(subproc) {
        var subflow = new Subflow(diagram, subproc);
        diagram.makeRoom(canvasDisplay, subflow.prepareDisplay());
        diagram.subflows.push(subflow);
      });
    }

    // notes
    diagram.notes = [];
    if (this.process.textNotes) {
      this.process.textNotes.forEach(function(textNote) {
        var note = new Note(diagram, textNote);
        diagram.makeRoom(canvasDisplay, note.prepareDisplay());
        diagram.notes.push(note);
      });
    }

    // marquee
    if (this.marquee)
      diagram.makeRoom(canvasDisplay, this.marquee.prepareDisplay());

    // allow extra room
    canvasDisplay.w += Diagram.BOUNDARY_DIM;
    canvasDisplay.h += Diagram.BOUNDARY_DIM;

    if (this.editable && Toolbox) {
      var toolbox = Toolbox.getToolbox();
      // fill available
      var parentWidth = this.canvas.parentElement.offsetWidth;
      if (toolbox)
        parentWidth -= toolbox.getWidth();
      if (canvasDisplay.w < parentWidth)
        canvasDisplay.w = parentWidth;
      if (toolbox && canvasDisplay.h < toolbox.getHeight())
        canvasDisplay.h = toolbox.getHeight();
    }

    var dpRatio = 1;
    if (window.devicePixelRatio) {
      dpRatio = window.devicePixelRatio;
    }
    if (dpRatio == 1) {
      this.canvas.width = canvasDisplay.w;
      this.canvas.height = canvasDisplay.h;
    }
    else {
      // fix blurriness on retina displays
      this.canvas.width = canvasDisplay.w * dpRatio;
      this.canvas.height = canvasDisplay.h * dpRatio;
      this.canvas.style.width = canvasDisplay.w + 'px';
      this.canvas.style.height = canvasDisplay.h + 'px';
      var ctx = this.canvas.getContext('2d');
      ctx.scale(dpRatio, dpRatio);
    }
  };

  // post-animation callback is the only way to prevent notes from screwing up context font (why?)
  Diagram.prototype.applyState = function(animate, callback) {
    var diagram = this; // forEach inner access

    if (this.process.activities) {
      this.process.activities.forEach(function(activity) {
        diagram.getStep(activity.id).instances = diagram.getActivityInstances(activity.id);
      });
    }

    diagram.steps.forEach(function(step) {
      if (step.activity.transitions) {
        step.activity.transitions.forEach(function(transition) {
          diagram.getLink(transition.id).instances = diagram.getTransitionInstances(transition.id);
        });
      }
    });

    if (this.process.subprocesses) {
      this.process.subprocesses.forEach(function(subproc) {
        var subflow = diagram.getSubflow(subproc.id);
        subflow.instances = diagram.getSubprocessInstances(subproc.id);
        // needed for subprocess & task instance retrieval
        subflow.mainProcessInstanceId = diagram.instance.id;
        if (subflow.subprocess.activities) {
          subflow.subprocess.activities.forEach(function(activity) {
            subflow.getStep(activity.id).instances = subflow.getActivityInstances(activity.id);
          });
        }
        subflow.steps.forEach(function(step) {
          if (step.activity.transitions) {
            step.activity.transitions.forEach(function(transition) {
              subflow.getLink(transition.id).instances = subflow.getTransitionInstances(transition.id);
            });
          }
        });
      });
    }

    var highlighted = null;
    var sequence = this.getSequence(true);
    if (sequence) {
      var update = function(it, slice) {
        var highlight = false;
        if (it instanceof Step) {
          if (animate) {
            // TODO: more sensible live scrolling based on ultimate endpoint (esp highlight)
            diagram.scrollIntoView(it, slice);
          }
          if (diagram.activityInstanceId) {
            it.instances.forEach(function(inst) {
              if (inst.id == diagram.activityInstanceId) {
                highlight = true;
              }
            });
          }
        }
        it.draw(animate ? slice : null);
        if (highlight) {
          it.highlight();
          highlighted = it;
        }
      };

      if (animate) {
        var linkCt = 0;
        var nonLinkCt = 0;
        sequence.forEach(function(it) {
          if (it instanceof Link)
            linkCt++;
          else
            nonLinkCt++;
        });
        var totalTime = sequence.length * 1000 / Diagram.ANIMATION_SPEED;
        var nonLinkSlice = totalTime / (nonLinkCt + 2 * linkCt);
        var linkSlice = Diagram.ANIMATION_LINK_FACTOR * nonLinkSlice;
        var timeSlice = nonLinkSlice;
        let i = 0;
        var s = function() {
          update(sequence[i], timeSlice);
          i++;
          if (i < sequence.length) {
            var nextSlice = sequence[i] instanceof Link ? linkSlice : nonLinkSlice;
            setTimeout(s, timeSlice);
            timeSlice = nextSlice;
          }
          else {
            callback();
          }
        };
        s();
      }
      else {
        sequence.forEach(update);
        if (highlighted) {
          this.scrollIntoView(highlighted, diagram.activityInstanceId ? 0 : 500);
        }
        callback();
      }
    }
  };

  Diagram.prototype.applyData = function() {
    var diagram = this; // forEach inner access

    if (this.data.hotspots && this.data.hotspots.length) {
      let hottest = this.data.hotspots.reduce((max, cur) => cur.ms > max.ms ? cur : max);
      diagram.steps.forEach(function(step) {
        let hotspot = diagram.data.hotspots.find(hs => ('A' + hs.id) === step.activity.id);
        if (hotspot && hotspot.ms) {
          step.data = { message: hotspot.ms + ' ms', heat: hotspot.ms/hottest.ms };
          step.data.color = "hsl(" + ((1.0 - step.data.heat) * 240) + ", 100%, 50%)";
          step.draw();
        }
      });
      if (diagram.subflows) {
        diagram.subflows.forEach(function(subflow) {
          subflow.steps.forEach(function(step) {
            let hotspot = diagram.data.hotspots.find(hs => ('A' + hs.id) === step.activity.id);
            if (hotspot && hotspot.ms) {
              step.data = { message: hotspot.ms + ' ms', heat: hotspot.ms/hottest.ms };
              step.data.color = "hsl(" + ((1.0 - step.data.heat) * 240) + ", 100%, 50%)";
              step.draw();
            }
          });
        });
      }
    }
  };

  Diagram.prototype.getSequence = function(runtime) {
    var seq = [];
    var start = this.getStart();
    if (start) {
      seq.push(start);
      this.addSequence(start, seq, runtime);
      var subflows = this.subflows.slice();
      subflows.sort(function(sf1, sf2) {
        if (Math.abs(sf1.display.y - sf2.display.y) > 100)
          return sf1.y - sf2.y;
        // otherwise closest to top-left of canvas
        return Math.sqrt(Math.pow(sf1.display.x,2) + Math.pow(sf1.display.y,2)) -
            Math.sqrt(Math.pow(sf2.display.x,2) + Math.pow(sf2.display.y,2));
      });
      var diagram = this;
      subflows.forEach(function(subflow) {
        if (!runtime || subflow.instances.length > 0) {
          seq.push(subflow);
          var substart = subflow.getStart();
          if (substart) {
            seq.push(substart);
            diagram.addSequence(substart, seq, runtime);
          }
        }
      });
    }
    return seq;
  };

  Diagram.prototype.addSequence = function(step, sequence, runtime) {
    var outSteps = [];
    var activityIdToInLinks = {};
    this.getOutLinks(step).forEach(function(link) {
      if (!runtime || link.instances.length > 0) {
        var outStep = link.to;
        var exist = activityIdToInLinks[outStep.activity.id];
        if (!exist) {
          activityIdToInLinks[outStep.activity.id] = [link];
          outSteps.push(outStep);
        }
        else {
          exist.push(link);
        }
      }
    });

    outSteps.sort(function(s1, s2) {
      if (runtime) {
        if (!s1.instances[0]) {
          return s2.instances[0] ? 1 : 0;
        }
        else if (!s2.instances[0]) {
          return -1;
        }
        else if (s1.instances[0].startDate !== s2.instances[0].startDate) {
          // ordered based on first instance occurrence
          return s1.instances[0].startDate.localeCompare(s2.instances[0].startDate);
        }
      }
      if (Math.abs(s1.display.y - s2.display.y) > 100)
        return s1.y - s2.y;
      // otherwise closest to top-left of canvas
      return Math.sqrt(Math.pow(s1.display.x,2) + Math.pow(s1.display.y,2)) -
          Math.sqrt(Math.pow(s2.display.x,2) + Math.pow(s2.display.y,2));
    });

    var diagram = this;
    var proceedSteps = [];  // those not already covered
    outSteps.forEach(function(step) {
      var links = activityIdToInLinks[step.activity.id];
      if (links) {
        links.forEach(function(link) {
          var l = sequence.find(function(it) {
            return it.workflowItem.id == link.transition.id;
          });
          if (!l)
            sequence.push(link);
        });
      }
      var s = sequence.find(function(it) {
        return it.workflowItem.id == step.activity.id;
      });
      if (!s) {
        sequence.push(step);
        proceedSteps.push(step);
      }
    });
    proceedSteps.forEach(function(step) {
      diagram.addSequence(step, sequence, runtime);
    });
  };

  Diagram.prototype.getStart = function() {
    for (var i = 0; i < this.steps.length; i++) {
      if (this.steps[i].activity.implementor == Step.START_IMPL)
        return this.steps[i];
    }
  };

  Diagram.prototype.makeRoom = function(canvasDisplay, display) {
    if (display.w > canvasDisplay.w)
      canvasDisplay.w = display.w;
    if (display.h > canvasDisplay.h)
      canvasDisplay.h = display.h;
  };

  Diagram.prototype.getStep = function(activityId) {
    for (var i = 0; i < this.steps.length; i++) {
      if (this.steps[i].activity.id == activityId)
        return this.steps[i];
    }
  };

  Diagram.prototype.getLink = function(transitionId) {
    for (var i = 0; i < this.links.length; i++) {
      if (this.links[i].transition.id == transitionId)
        return this.links[i];
    }
  };

  Diagram.prototype.getLinks = function(step) {
    var links = [];
    for (var i = 0; i < this.links.length; i++) {
      if (step.activity.id == this.links[i].to.activity.id || step.activity.id == this.links[i].from.activity.id)
        links.push(this.links[i]);
    }
    return links;
  };

  Diagram.prototype.getOutLinks = function(step) {
    var links = [];
    for (let i = 0; i < this.links.length; i++) {
      if (step.activity.id == this.links[i].from.activity.id)
        links.push(this.links[i]);
    }
    this.subflows.forEach(function(subflow) {
      links = links.concat(subflow.getOutLinks(step));
    });
    return links;
  };

  Diagram.prototype.getSubflow = function(subprocessId) {
    for (var i = 0; i < this.subflows.length; i++) {
      if (this.subflows[i].subprocess.id == subprocessId)
        return this.subflows[i];
    }
  };

  Diagram.prototype.getNote = function(textNoteId) {
    for (var i = 0; i < this.notes.length; i++) {
      if (this.notes[i].textNote.id == textNoteId)
        return this.notes[i];
    }
  };

  Diagram.prototype.get = function(id) {
    if (id.startsWith('A'))
      return this.getStep(id);
    else if (id.startsWith('T'))
      return this.getLink(id);
    else if (id.startsWith('P'))
      return this.getSubflow(id);
    else if (id.startsWith('N'))
      return this.getNote(id);
  };

  // Whether the obj can be edited at instance level.
  // Cannot have instances and (TODO) must be reachable downstream of a currently paused activity.
  Diagram.prototype.isInstanceEditable = function(id) {
    if (this.instanceEdit) {
      var obj = this.get(id);
      if (!obj && this.subflows) {
        for (let i = 0; i < this.subflows.length; i++) {
          obj = this.subflows[i].get(id);
          if (obj)
            break;
        }
      }
      if (obj) {
        if (obj.isSubflow && obj.instances && obj.instances.length === 1 && obj.instances[0].status === 'In Progress') {
          return true;
        }
        if (!obj.instances || !obj.instances.length) {
          return true;
        }
      }
    }
  };

  Diagram.prototype.getImplementor = function(className) {
    if (this.implementors) {
      for (var i = 0; i < this.implementors.length; i++) {
        var implementor = this.implementors[i];
        if (implementor.implementorClass == className) {
          return implementor;
        }
      }
    }
    // not found -- return placeholder
    return { implementorClass: className, category: 'com.centurylink.mdw.activity.types.GeneralActivity', icon: 'shape:activity', label: 'Unknown Implementer' };
  };

  Diagram.prototype.findInSubflows = function(x, y) {
    if (this.subflows) {
      for (let i = 0; i < this.subflows.length; i++) {
        if (this.subflows[i].isHover(x, y)) {
          return this.subflows[i];
        }
      }
    }
  };

  Diagram.prototype.addStep = function(impl, x, y) {
    var implementor = this.getImplementor(impl);
    var steps = this.steps.slice(0);
    if (this.subflows) {
      for (let i = 0; i < this.subflows.length; i++) {
        steps = steps.concat(this.subflows[i].steps);
      }
    }
    var step = Step.create(this, this.genId(steps, 'activity'), implementor, x, y);
    var hoverObj = this.getHoverObj(x, y);
    if (hoverObj && hoverObj.isSubflow) {
      hoverObj.subprocess.activities.push(step.activity);
      hoverObj.steps.push(step);
    }
    else {
      var subflow = this.findInSubflows(x, y);
      if (subflow) {
        subflow.subprocess.activities.push(step.activity);
        subflow.steps.push(step);
      }
      else {
        this.process.activities.push(step.activity);
        this.steps.push(step);
      }
    }
  };

  Diagram.prototype.addLink = function(from, to) {
    var links = this.links.slice(0);
    if (this.subflows) {
      for (let i = 0; i < this.subflows.length; i++) {
        links = links.concat(this.subflows[i].links);
      }
    }
    var link = Link.create(this, this.genId(links, 'transition'), from, to);
    var destSubflow = null;
    if (this.subflows) {
      for (var i = 0; i < this.subflows.length; i++) {
        if (this.subflows[i].get(to.activity.id))
          destSubflow = this.subflows[i];
      }
    }
    if (destSubflow) {
      destSubflow.links.push(link);
    }
    else {
      this.links.push(link);
    }
  };

  Diagram.prototype.addSubflow = function(type, x, y) {
    var startActivityId = this.genId(this.steps, 'activity');
    var startTransitionId = this.genId(this.links, 'transition');
    var subprocId = this.genId(this.subflows, 'subprocess');
    var subflow = Subflow.create(this, subprocId, startActivityId, startTransitionId, type, x, y);
    if (!this.process.subprocesses)
      this.process.subprocesses = [];
    this.process.subprocesses.push(subflow.subprocess);
    this.subflows.push(subflow);
  };

  Diagram.prototype.addNote = function(x, y) {
    var note = Note.create(this, this.genId(this.notes, 'textNote'), x, y);
    this.process.textNotes.push(note.textNote);
    this.notes.push(note);
  };

  Diagram.prototype.genId = function(items, workflowType) {
    var maxId = 0;
    if (items) {
      items.forEach(function(item) {
        var itemId = parseInt(item[workflowType].id.substring(1));
        if (itemId > maxId)
          maxId = itemId;
      });
    }
    return maxId + 1;
  };

  Diagram.prototype.deleteStep = function(step) {
    var idx = -1;
    for (let i = 0; i < this.steps.length; i++) {
      var s = this.steps[i];
      if (step.activity.id === s.activity.id) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      this.process.activities.splice(idx, 1);
      this.steps.splice(idx, 1);
      for (let i = 0; i < this.links.length; i++) {
        var link = this.links[i];
        if (link.to.activity.id === step.activity.id) {
          this.deleteLink(link);
        }
      }
    }
    else if (this.subflows) {
      for (let i = 0; i < this.subflows.length; i++) {
        this.subflows[i].deleteStep(step);
      }
    }
  };

  Diagram.prototype.deleteLink = function(link) {
    var idx = -1;
    for (let i = 0; i < this.links.length; i++) {
      var l = this.links[i];
      if (l.transition.id === link.transition.id) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      this.links.splice(idx, 1);
      var tidx = -1;
      for (let i = 0; i < link.from.activity.transitions.length; i++) {
        if (link.from.activity.transitions[i].id === link.transition.id) {
          tidx = i;
          break;
        }
      }
      if (tidx >= 0) {
        link.from.activity.transitions.splice(tidx, 1);
      }
    }
    else if (this.subflows) {
      for (let i = 0; i < this.subflows.length; i++) {
        this.subflows[i].deleteLink(link);
      }
    }
  };

  Diagram.prototype.deleteSubflow = function(subflow) {
    var idx = -1;
    for (let i = 0; i < this.subflows.length; i++) {
      var s = this.subflows[i];
      if (s.subprocess.id === subflow.subprocess.id) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      this.process.subprocesses.splice(idx, 1);
      this.subflows.splice(idx, 1);
    }
  };

  Diagram.prototype.deleteNote = function(note) {
    var idx = -1;
    for (let i = 0; i < this.notes.length; i++) {
      var n = this.notes[i];
      if (n.textNote.id === note.textNote.id) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      this.process.textNotes.splice(idx, 1);
      this.notes.splice(idx, 1);
    }
  };

  Diagram.prototype.getActivityInstances = function(id) {
    if (this.instance) {
      var insts = [];  // should always return something, even if empty
      if (this.instance.activities) {
        var procInstId = this.instance.id;
        this.instance.activities.forEach(function(actInst) {
          if ('A' + actInst.activityId == id) {
            actInst.processInstanceId = procInstId; // needed for subprocess & task instance retrieval
            insts.push(actInst);
          }
        });
      }
      insts.sort(function(a1, a2) {
        return a2.id - a1.id;
      });
      return insts;
    }
  };

  Diagram.prototype.getTransitionInstances = function(id) {
    if (this.instance) {
      var insts = [];  // should always return something, even if empty
      if (this.instance.transitions) {
        this.instance.transitions.forEach(function(transInst) {
          if ('T' + transInst.transitionId == id)
            insts.push(transInst);
        });
      }
      insts.sort(function(t1, t2) {
        return t2.id - t1.id;
      });
      return insts;
    }
  };

  Diagram.prototype.getSubprocessInstances = function(id) {
    if (this.instance) {
      var insts = [];  // should always return something, even if empty
      if (this.instance.subprocesses) {
        this.instance.subprocesses.forEach(function(subInst) {
          if ('P' + subInst.processId == id)
            insts.push(subInst);
        });
      }
      insts.sort(function(s1, s2) {
        return s2.id - s1.id;
      });
      return insts;
    }
  };

  Diagram.prototype.drawState = function(display, instances, ext, adj, animationSlice /* not used */, color, fill) {
    if (instances) {
      var count = instances.length > Step.MAX_INSTS ? Step.MAX_INSTS : instances.length;
      for (var i = 0; i < count; i++) {
        var instance = instances[i];
        var rounding = DC.BOX_ROUNDING_RADIUS;
        if (instance.statusCode) {
          var status = Step.STATUSES[instance.statusCode];
          instance.status = status.status;
          var statusColor = color ? color : status.color;
          var del = Step.INST_W - Step.OLD_INST_W;
          if (ext) {
            var rem = count - i;
            if (i === 0) {
              this.rect(
                  display.x - Step.OLD_INST_W * rem - del,
                  display.y - Step.OLD_INST_W * rem - del,
                  display.w + Step.OLD_INST_W * 2* rem + 2 * del,
                  display.h + Step.OLD_INST_W * 2 * rem + 2 * del,
                  statusColor, statusColor, rounding);
            }
            else {
              this.rect(
                  display.x - Step.OLD_INST_W * rem,
                  display.y - Step.OLD_INST_W * rem,
                  display.w + Step.OLD_INST_W * 2 * rem,
                  display.h + Step.OLD_INST_W * 2 * rem,
                  statusColor, statusColor, 0);
            }
            rem--;
            this.context.clearRect(
                display.x - Step.OLD_INST_W * rem - 1,
                display.y - Step.OLD_INST_W * rem - 1,
                display.w + Step.OLD_INST_W * 2 * rem + 2,
                display.h + Step.OLD_INST_W * 2 * rem + 2);
          }
          else {
            var x1, y1, w1, h1;
            if (i === 0) {
              this.rect(
                  display.x - adj,
                  display.y - adj,
                  display.w + 2 * adj,
                  display.h + 2 * adj,
                  statusColor, statusColor, rounding);
              x1 = display.x + del;
              y1 = display.y + del;
              w1 = display.w - 2 * del;
              h1 = display.h - 2 * del;
            }
            else {
              x1 = display.x + Step.OLD_INST_W * i + del;
              y1 = display.y + Step.OLD_INST_W * i + del;
              w1 = display.w - Step.OLD_INST_W * 2 * i - 2 * del;
              h1 = display.h - Step.OLD_INST_W * 2 * i - 2 * del;
              if (w1 > 0 && h1 > 0)
                this.rect(x1, y1, w1, h1, statusColor, statusColor);
            }
            x1 += Step.OLD_INST_W - 1;
            y1 += Step.OLD_INST_W - 1;
            w1 -= 2 * Step.OLD_INST_W - 2;
            h1 -= 2 * Step.OLD_INST_W - 2;
            if (w1 > 0 && h1 > 0) {
              if (fill) {
                this.rect(x1, y1, w1, h1, statusColor, fill);
              }
              else {
                this.context.clearRect(x1, y1, w1, h1);
              }
            }
          }
        }
      }
    }
  };

  Diagram.prototype.drawData = function(display, size, color, opacity) {
    if (opacity)
      this.context.globalAlpha = opacity;
    var rounding = DC.BOX_ROUNDING_RADIUS;
    var x1, y1, w1, h1;
    this.rect(
        display.x,
        display.y,
        display.w,
        display.h,
        color, color, rounding);
    x1 = display.x + size;
    y1 = display.y + size;
    w1 = display.w - 2 * size;
    h1 = display.h - 2 * size;
    x1 += Step.OLD_INST_W;
    y1 += Step.OLD_INST_W;
    w1 -= 2 * Step.OLD_INST_W;
    h1 -= 2 * Step.OLD_INST_W;
    if (w1 > 0 && h1 > 0)
      this.context.clearRect(x1, y1, w1, h1);
    if (opacity)
      this.context.globalAlpha = 1.0;
  };

  Diagram.prototype.roundedRect = function(x, y, w, h, border, fill) {
    this.rect(x, y, w, h, border, fill, DC.BOX_ROUNDING_RADIUS);
  };

  Diagram.prototype.rect = function(x, y, w, h, border, fill, r) {
    if (border)
      this.context.strokeStyle = border;
    if (fill)
      this.context.fillStyle = fill;

    if (!r) {
      this.context.strokeRect(x, y, w, h);
      if (fill)
        this.context.fillRect(x, y, w, h);
    }
    else {
      // rounded corners
      this.context.beginPath();
      this.context.moveTo(x + r, y);
      this.context.lineTo(x + w - r, y);
      this.context.quadraticCurveTo(x + w, y, x + w, y + r);
      this.context.lineTo(x + w, y + h - r);
      this.context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      this.context.lineTo(x + r, y + h);
      this.context.quadraticCurveTo(x, y + h, x, y + h - r);
      this.context.lineTo(x, y + r);
      this.context.quadraticCurveTo(x, y, x + r, y);
      this.context.closePath();

      this.context.stroke();
      if (fill)
        this.context.fill();
    }

    this.context.fillStyle = DC.DEFAULT_COLOR;
    this.context.strokeStyle = DC.DEFAULT_COLOR;
  };

  Diagram.prototype.drawOval = function(x, y, w, h, color, fill) {
    var kappa = 0.5522848;
    var ox = (w / 2) * kappa; // control point offset horizontal
    var oy = (h / 2) * kappa; // control point offset vertical
    var xe = x + w; // x-end
    var ye = y + h; // y-end
    var xm = x + w / 2; // x-middle
    var ym = y + h / 2; // y-middle

    if (color) {
      this.context.strokeStyle = color;
      this.context.lineWidth = DC.OVAL_LINE_WIDTH;
    }
    this.context.beginPath();
    this.context.moveTo(x, ym);
    this.context.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
    this.context.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
    this.context.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
    this.context.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);
    this.context.closePath(); // not used correctly? (use to close off open path)
    if (fill) {
      this.context.fillStyle = fill;
      this.context.fill();
      this.context.stroke();
    }
    else {
      this.context.stroke();
    }
    this.context.fillStyle = DC.DEFAULT_COLOR;
    if (color) {
      this.context.strokeStyle = DC.DEFAULT_COLOR;
      this.context.lineWidth = DC.DEFAULT_LINE_WIDTH;
    }
  };

  Diagram.prototype.drawLine = function(segments, color, width) {
    if (color)
      this.context.strokeStyle = color;
    if (width)
      this.context.lineWidth = width;
    this.context.beginPath();
    var diagram = this;
    segments.forEach(function(seg) {
      diagram.context.moveTo(seg.from.x, seg.from.y);
      diagram.context.lineTo(seg.to.x, seg.to.y);
    });
    this.context.stroke();
    this.context.strokeStyle = DC.DEFAULT_COLOR;
    this.context.lineWidth = DC.DEFAULT_LINE_WIDTH;
  };

  Diagram.prototype.animateLine = function(segments, color, width, slice) {
    var x1 = segments[0].from.x;
    var y1 = segments[0].from.y;
    var x2, y2;
    var i = 0; // segment index
    var j = 0; // subsegment
    var context = this.context;
    var perSeg = Math.ceil(slice / (1000 / 60) / segments.length);
    var d = function() {
      var segment = segments[i];
      if (j >= perSeg) {
        i++;
        j = 0;
      }
      else {
        var lastSeg = j == perSeg - 1;
        x2 = lastSeg ? segment.to.x : x1 + (segment.to.x - segment.from.x) / perSeg;
        y2 = lastSeg ? segment.to.y : y1 + (segment.to.y - segment.from.y) / perSeg;
        context.strokeStyle = color;
        context.lineWidth = width;
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        if (lastSeg) {
          if (typeof segment.lineEnd === 'object' && segment.lineEnd.cpx) {
            x2 = segment.lineEnd.x;
            y2 = segment.lineEnd.y;
            context.quadraticCurveTo(segment.lineEnd.cpx, segment.lineEnd.cpy, x2, y2);
          }
          else if (typeof segment.lineEnd === 'function') {
            context.stroke();
            context.fillStyle = color;
            segment.lineEnd(context);
            context.lineWidth = width;
            context.strokeStyle = color;
            context.fillStyle = DC.DEFAULT_COLOR;
          }
        }
        context.stroke();
        context.lineWidth = DC.DEFAULT_LINE_WIDTH;
        context.strokeStyle = DC.DEFAULT_COLOR;
        j++;
      }
      if (i < segments.length) {
        x1 = x2;
        y1 = y2;
        window.requestAnimationFrame(d);
      }
    };
    d();
  };

  Diagram.prototype.drawDiamond = function(x, y, w, h) {
    var xh = x + w / 2;
    var yh = y + h / 2;
    this.context.beginPath();
    this.context.moveTo(x, yh);
    this.context.lineTo(xh, y);
    this.context.lineTo(x + w, yh);
    this.context.lineTo(xh, y + h);
    this.context.lineTo(x, yh);
    this.context.closePath();
    this.context.stroke();
  };

  Diagram.prototype.drawImage = function(src, x, y) {
    src = this.imgBase + '/' + src;
    if (!this.images)
      this.images = {};
    var img = this.images[src];
    if (!img) {
      img = new Image();
      img.src = src;
      var context = this.context;
      var images = this.images;
      img.onload = function() {
        context.drawImage(img, x, y);
        images[src] = img;
      };
    }
    else {
      this.context.drawImage(img, x, y);
    }
  };

  // TODO: horizontal scroll
  Diagram.prototype.scrollIntoView = function(shape, timeSlice) {
    var centerX = shape.display.x + shape.display.w / 2;
    var centerY = shape.display.y + shape.display.h / 2;

    var container = document.body;
    if (this.containerId) {
      container = document.getElementById(this.containerId);
    }

    var clientRect = this.canvas.getBoundingClientRect();
    var canvasLeftX = clientRect.left;
    var canvasTopY = clientRect.top;

    if (container.scrollHeight > container.clientHeight) {
      var maxVScroll = container.scrollHeight - container.clientHeight;
      var centeringVScroll = centerY - container.clientHeight / 2;
      if (centeringVScroll > 0) {
        var vScroll = centeringVScroll > maxVScroll ? maxVScroll : centeringVScroll;
        var vDelta = vScroll - container.scrollTop;
        // not sure about other logic, but force scroll for these conditions
        if (timeSlice === 0 && container === document.body) {
          window.scroll(0, vDelta);
          return;
        }
        var winDelta = 0;
        var bottomY = canvasTopY + shape.display.y + shape.display.h - vDelta + DC.HIGHLIGHT_MARGIN*2;
        if (document.documentElement.clientHeight < bottomY) {
          winDelta = bottomY - document.documentElement.clientHeight;
        }
        var slices = !timeSlice ? 1 : Math.ceil(timeSlice / (1000 / 60));
        var i = 0;
        var winScrollY = 0;
        var scroll = function() {
          container.scrollTop += vDelta/slices;
          if (winDelta > 0) {
            winScrollY += winDelta/slices;
            window.scroll(0, winScrollY);
          }
          i++;
          if (i < slices) {
            window.requestAnimationFrame(scroll);
          }
        };
        scroll();
      }
    }
  };

  Diagram.prototype.onMouseDown = function(e) {
    var rect = this.canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;

    // starting points for drag
    this.dragX = x;
    this.dragY = y;

    var selObj = this.getHoverObj(x, y);

    if (this.editable && e.ctrlKey) {
      if (selObj) {
        if (this.selection.includes(selObj))
          this.selection.remove(selObj);
        else
          this.selection.add(selObj);
        selObj.select();
      }
    }
    else {
      if (!this.selection.includes(selObj)) {
        // normal single select
        this.selection.setSelectObj(selObj);
        this.unselect();
        if (this.selection.getSelectObj()) {
          this.selection.getSelectObj().select();
          if (this.editable && e.shiftKey && this.selection.getSelectObj().isStep)
            this.shiftDrag = true;
        }
      }
    }
  };

  Diagram.prototype.onMouseUp = function(e) {
    if (this.shiftDrag && this.dragX && this.dragY) {
      if (this.selection.getSelectObj() && this.selection.getSelectObj().isStep) {
        var rect = this.canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        var destObj = this.getHoverObj(x, y);
        if (destObj && destObj.isStep) {
          this.addLink(this.selection.getSelectObj(), destObj);
          this.draw();
        }
      }
    }
    this.shiftDrag = false;

    if (this.marquee) {
      this.selection.setSelectObj(null);
      var selObjs = this.marquee.getSelectObjs();
      for (let i = 0; i < selObjs.length; i++) {
        selObjs[i].select();
        this.selection.add(selObjs[i]);
      }
      this.marquee = null;
    }
    else {
      this.selection.reselect();
    }
  };

  Diagram.prototype.onMouseOut = function(e) {
    document.body.style.cursor = 'default';
  };

  Diagram.prototype.onMouseMove = function(e) {
    var rect = this.canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    this.anchor = -1;
    this.hoverObj = this.getHoverObj(x, y);
    if (this.hoverObj) {
      if (this.editable && (this.hoverObj == this.selection.getSelectObj())) {
        this.anchor = this.hoverObj.getAnchor(x, y);
        if (this.anchor >= 0) {
          if (this.hoverObj.isLink) {
            document.body.style.cursor = 'crosshair';
          }
          else {
            if (this.anchor === 0 || this.anchor == 2)
              document.body.style.cursor = 'nw-resize';
            else if (this.anchor == 1 || this.anchor == 3)
              document.body.style.cursor = 'ne-resize';
          }
        }
        else {
          document.body.style.cursor = 'pointer';
        }
      }
      else {
        document.body.style.cursor = 'pointer';
      }
    }
    else {
      document.body.style.cursor = '';
    }
  };

  Diagram.prototype.onMouseDrag = function(e) {
    if (this.editable && this.dragX && this.dragY && !e.ctrlKey) {
      var rect = this.canvas.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      var deltaX = x - this.dragX;
      var deltaY = y - this.dragY;

      if (Math.abs(deltaX) > DC.MIN_DRAG || Math.abs(deltaY) > DC.MIN_DRAG) {

        if (x > rect.right - Diagram.BOUNDARY_DIM)
          this.canvas.width = this.canvas.width + Diagram.BOUNDARY_DIM;
        if (y > rect.bottom - Diagram.BOUNDARY_DIM)
          this.canvas.height = this.canvas.height + Diagram.BOUNDARY_DIM;

        var selObj = this.selection.getSelectObj();
        if (selObj) {
          if (this.instanceEdit && (!selObj.workflowItem || !this.isInstanceEditable(selObj.workflowItem.id))) {
            return;
          }

          var diagram = this;
          if (this.shiftDrag) {
            if (this.selection.getSelectObj().isStep) {
              this.draw();
              this.drawLine([{
                from: {x: this.dragX, y: this.dragY},
                to: {x: x, y: y}
              }], DC.LINE_COLOR);
              return true;
            }
          }
          else if (this.anchor >= 0) {
            if (this.selection.getSelectObj().isLink) {
              let link = this.selection.getSelectObj();
              link.moveAnchor(this.anchor, x - this.dragX, y - this.dragY);
              if (this.anchor === 0) {
                let hovStep = this.getHoverStep(x, y);
                if (hovStep && link.from.activity.id != hovStep.activity.id)
                  link.setFrom(hovStep);
              }
              else if (this.anchor == this.selection.getSelectObj().display.xs.length - 1) {
                var hovStep = this.getHoverStep(x, y);
                if (hovStep && link.to.activity.id != hovStep.activity.id)
                  link.setTo(hovStep);
              }
              this.draw();
            }
            if (this.selection.getSelectObj().resize) {
              if (this.selection.getSelectObj().isStep) {
                let activityId = this.selection.getSelectObj().activity.id;
                let step = this.getStep(activityId);
                if (step) {
                  this.selection.getSelectObj().resize(this.dragX, this.dragY, x - this.dragX, y - this.dragY);
                  this.getLinks(step).forEach(function(link) {
                    link.recalc(step);
                  });
                }
                else {
                  // try subflows
                  this.subflows.forEach(function(subflow) {
                    let step = subflow.getStep(activityId);
                    if (step) {
                      // only within bounds of subflow
                      diagram.selection.getSelectObj().resize(diagram.dragX, diagram.dragY, x - diagram.dragX, y - diagram.dragY, subflow.display);
                      subflow.getLinks(step).forEach(function(link) {
                        link.recalc(step);
                      });
                    }
                  });
                }
              }
              else {
                this.selection.getSelectObj().resize(this.dragX, this.dragY, x - this.dragX, y - this.dragY);
              }
              this.draw();
              var obj = this.getHoverObj(x, y);
              if (obj)
                obj.select();
              return true;
            }
          }
          else {
            this.selection.move(this.dragX, this.dragY, deltaX, deltaY);
            // non-workflow selection may not be reselected after move
            var hovObj = this.diagram.getHoverObj(x, y);
            if (hovObj)
              hovObj.select();
            return true;
          }
        }
        else {
          if (this.marquee) {
            this.marquee.resize(this.dragX, this.dragY, x - this.dragX, y - this.dragY);
          }
          else {
            this.marquee = new Marquee(this);
            this.marquee.start(this.dragX, this.dragY);
          }
          this.draw();
        }
      }
    }
  };

  Diagram.prototype.onDrop = function(e, item) {
    var rect = this.canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    if (item.category == 'subflow') {
      this.addSubflow(item.implementorClass, x, y);
    }
    else if (item.category == 'note') {
      this.addNote(x, y);
    }
    else {
      this.addStep(item.implementorClass, x, y);
    }
    this.draw();
    return true;
  };

  Diagram.prototype.onDelete = function(e, onChange) {
    var selection = this.selection;
    var selObj = this.selection.getSelectObj();
    if (selObj && !selObj.isLabel) {
      var msg = this.selection.isMulti ? 'Delete selected items?' : 'Delete ' + selObj.workflowType + '?';
      this.dialog.confirm('Confirm Delete', msg, function(res) {
        if (res) {
          selection.doDelete();
          selection.diagram.draw();
          onChange();
        }
      });
    }
  };

  Diagram.prototype.getLatestInstance = function() {
    var instances = this.selection.getSelectObj().instances;
    if (instances && instances.length) {
      return instances[0];  // They are sorted descending
    }
  };

  Diagram.prototype.getContextMenuItems = function(e) {
    var selObj = this.selection.getSelectObj();
    if (selObj && selObj.workflowType == 'activity') {
      var actions = [];
      if (this.instance && (this.instance.status === 'In Progress' || this.instance.status === 'Waiting')) {
        var inst = this.getLatestInstance();
        if (inst && inst.status) {
          if (inst.status === 'Failed') {
            actions.push('retry');
            actions.push('proceed');
          }
          else if (inst.status === 'Waiting' || inst.status === 'In Progress') {
            var impl = selObj.implementor;
            if (inst.status === 'Waiting') {
              actions.push('proceed');
              if (impl && impl.category && impl.category === 'com.centurylink.mdw.activity.types.PauseActivity') {
                  actions.push('resume');
              }
            }
            if (impl && impl.category && impl.category !== 'com.centurylink.mdw.activity.types.TaskActivity') {
              actions.push('fail');
            }
          }
        }
      }
      return actions;
    }
  };

  Diagram.prototype.getHoverObj = function(x, y) {
    if (this.zoom != 100) {
      var scale = this.zoom / 100;
      x = x / scale;
      y = y / scale;
    }

    if (this.label.isHover(x, y))
      return this.label;
    // links checked before steps for better anchor selectability
    for (i = 0; i < this.subflows.length; i++) {
      var subflow = this.subflows[i];
      if (subflow.title.isHover(x, y))
        return subflow;
      if (subflow.isHover(x, y)) {
        for (j = 0; j < subflow.links.length; j++) {
          if (subflow.links[j].isHover(x, y)) {
            return subflow.links[j];
          }
        }
        for (var j = 0; j < subflow.steps.length; j++) {
          if (subflow.steps[j].isHover(x, y)) {
            return subflow.steps[j];
          }
        }
        return subflow;
      }
    }
    for (i = 0; i < this.links.length; i++) {
      if (this.links[i].isHover(x, y)) {
        return this.links[i];
      }
    }
    for (var i = 0; i < this.steps.length; i++) {
      if (this.steps[i].isHover(x, y)) {
        return this.steps[i];
      }
    }
    for (i = 0; i < this.notes.length; i++) {
      if (this.notes[i].isHover(x, y))
        return this.notes[i];
    }
  };

  Diagram.prototype.getHoverStep = function(x, y) {
    for (let i = 0; i < this.subflows.length; i++) {
      var subflow = this.subflows[i];
      if (subflow.isHover(x, y)) {
        for (var j = 0; j < subflow.steps.length; j++) {
          if (subflow.steps[j].isHover(x, y))
            return subflow.steps[j];
        }
      }
    }
    for (let i = 0; i < this.steps.length; i++) {
      if (this.steps[i].isHover(x, y))
        return this.steps[i];
    }
  };

  // when nothing selectable is hovered
  Diagram.prototype.getBackgroundObj = function(e) {
    var rect = this.canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var bgObj = this;
    for (var i = 0; i < this.subflows.length; i++) {
      if (this.subflows[i].isHover(x, y)) {
        bgObj = this.subflows[i];
        break;
      }
    }

    if (bgObj == this)
      this.label.select();
    else
      bgObj.select();

    return bgObj;
  };

  // removes anchors from currently selected obj, if any
  Diagram.prototype.unselect = function() {
    this.draw();
  };

  Diagram.prototype.getAnchor = function(x, y) {
    return -1; // not applicable
  };

  return Diagram;
};

if (typeof angular !== 'undefined') {
  var diagramMod = angular.module('mdwDiagram', ['mdw', 'drawingConstants']);
  diagramMod.factory('Diagram',
      ['DC', 'Shape', 'Label', 'Step', 'Link', 'Subflow', 'Note', 'Marquee', 'Selection', 'Toolbox',
      function(DC, Shape, Label, Step, Link, Subflow, Note, Marquee, Selection, Toolbox) {
    return DiagramFactory(DC, Shape, Label, Step, Link, Subflow, Note, Marquee, Selection, Toolbox);
  }]);
}
if (typeof module !== 'undefined') {
  module.exports = DiagramFactory;
}