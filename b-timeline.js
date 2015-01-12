/*!
 * b-timeline v0.2.0, https://github.com/hoho/b-timeline
 * (c) 2013-2015 Marat Abdullin, MIT license
 */
(function(window, document, undefined) {
    'use strict';

    var T,
        isUndefined = function(val) { return typeof val === 'undefined'; },
        isFunction = function(val) { return typeof val === 'function'; },

        floor = Math.floor,
        ceil = Math.ceil,
        round = Math.round,
        abs = Math.abs,

        _24hours = 86400000,
        defaultTicks = [
            {left: '0',     label: '00:00'},
            {left: '12.5%', label: '03:00'},
            {left: '25%',   label: '06:00'},
            {left: '37.5%', label: '09:00'},
            {left: '50%',   label: '12:00'},
            {left: '62.5%', label: '15:00'},
            {left: '75%',   label: '18:00'},
            {left: '87.5%', label: '21:00'}
        ],

        months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],

        bemBlockName = 'b-timeline',

        ///////////////////////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////
        css = function(elem, props) {
            var style = elem.style,
                prop,
                val;

            for (prop in props) {
                val = props[prop];
                // TODO: Add 'px' suffix to a certain properies only (left,
                //       width and so on).
                try { style[prop] = val + (typeof val === 'number' ? 'px' : ''); } catch(e) {};
            }
        },
        ///////////////////////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////
        bemClass = function(elem, mods) {
            // Concatenate block or element class attribute value.
            if (typeof elem !== 'string') {
                mods = elem;
                elem = undefined;
            }

            var base = bemBlockName + (elem ? '__' + elem : ''),
                ret = [base],
                mod;

            for (mod in mods) {
                ret.push(base + '_' + mod + (mods[mod] === true ? '' : '_' + mods[mod]));
            }

            return ret.join(' ');
        },
        ///////////////////////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////
        createAttributes = function(elem, attr, mods) {
            // Shortcut for attributes object.
            attr = attr || {};
            attr['class'] = bemClass(elem, mods);
            return attr;
        },
        ///////////////////////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////
        bindMouseWheel = function(elem, callback) {
            var minDelta,
                handler =
                    function(event) {
                        var delta = 0,
                            absDelta;

                        if (!event) { event = window.event; }

                        // Old school scrollwheel delta
                        if (event.wheelDelta) { delta = event.wheelDelta * -1; }
                        if (event.detail) { delta = event.detail; }

                        // New school wheel delta (wheel event)
                        if (event.deltaX && delta == 0) { delta  = event.deltaX; }
                        if (event.deltaY && delta == 0) { delta = event.deltaY; }

                        // Webkit
                        if (event.wheelDeltaX && delta == 0) { delta = event.wheelDeltaX; }
                        if (event.wheelDeltaY && delta == 0) { delta = event.wheelDeltaY; }

                        absDelta = abs(delta);

                        if (isUndefined(minDelta) || absDelta < minDelta) {
                            minDelta = absDelta;
                        }

                        callback(delta / (minDelta || 1));

                        if (event.preventDefault) {
                            event.preventDefault();
                        }

                        return (event.returnValue = false);
                    };

            if (elem.addEventListener) {
                var toBind = 'onwheel' in document || document.documentMode >= 9 ?
                        ['wheel']
                        :
                        ['mousewheel', 'DomMouseScroll', 'MozMousePixelScroll'],
                    i;

                for (i = 0; i < toBind.length; i++) {
                    elem.addEventListener(toBind[i], handler, false);
                }
            } else {
                elem.onmousewheel = handler;
            }
        },
        ///////////////////////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////
        bind = function(self, func) {
            return function() {
                func.apply(self, arguments);
            };
        };
        ///////////////////////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////

    T = window.Timeline = function(container, bindEventFunc) {
        /* Naming: __something    is a private Timeline field,
                   __something__  is a private Timeline method,
                   something      is just a variable. */

        var timelineObj = this,

            __bounds = {
                minTime:             0,
                maxTime:             0,

                now:                 undefined,

                autoUpdate:          false,

                viewport:            1,
                minViewport:         undefined,
                maxViewport:         undefined,
                preloadBefore:       1,
                preloadAfter:        1,

                scrollViewport:      0.5,
                scrollPreloadBefore: 1,
                scrollPreloadAfter:  1
            },

            __evaluatedBounds,

            __minTime,
            __maxTime,
            __now,

            __autoUpdate,
            __autoUpdateTimer,

            __actualMinTime,

            __elem,
            __errorElem,
            __pickElem,
            __scalerElem,

            __mainView,
            __mainViewLeftElem,
            __mainViewRightElem,

            __scrollBar,
            __scrollBarLeftElem,
            __scrollBarRightElem,

            __mainViewError,

            __clickCallback,
            __positionCallback,

            __resizeTimer,

            TimelineInternal = function(timeframesElem, leftElem, rightElem,
                                        keyboardControl, clickCallback,
                                        positionCallback)
            {
                var timelineInternalObj = this,

                    mousedownX,
                    mousemoved,

                    markAttributes = createAttributes(
                        'mark',
                        {'data-index': function(index) { return index; }}
                    ),

                    __timeframes = {},
                    __events = {},

                    __timeframeFrom,
                    __timeframeTo,

                    __timeframeElemWidth,
                    __prevViewportSize,

                    __preloadBefore,
                    __preloadAfter,

                    __viewportSize,

                    __position,
                    __realPosition,

                    __curAnimationDestination,
                    __curAnimationStepCallback,
                    __curPositionCallbackFirstArg,

                    __prevNow,

                    __getTimeByTimeframe__,
                    __getTimeframeByTime__,
                    __getTicks__,

                    __getEventsTimer,
                    __getEvents__ = function(timeFrom, timeTo) {
                        timelineInternalObj.push(timeFrom, timeTo, []);
                    },
                    ///////////////////////////////////////////////////////////
                    ///////////////////////////////////////////////////////////
                    __removeEvent__ = function(id, keepInDOM) {
                        var event = __events[id],
                            timeframe;

                        if (event) {
                            delete __events[id];

                            if (event.timeframe) {
                                timeframe = __timeframes[event.timeframe];

                                delete timeframe.events[id];
                                delete timeframe.unfinished[id];

                                if (!keepInDOM) {
                                    timeframe.eventsElem.removeChild(event.elem1);
                                    timeframe.eventsElem.removeChild(event.elem2);
                                }
                            }
                        }
                    },
                    ///////////////////////////////////////////////////////////
                    ///////////////////////////////////////////////////////////
                    __addTimeframe__ = function(timeframe) {
                        if (isUndefined(__timeframes[timeframe])) {
                            var t = __timeframes[timeframe] = {
                                    events:     {},
                                    unfinished: {}
                                },

                                timeFrom = __getTimeByTimeframe__(timeframe),
                                timeTo   = __getTimeByTimeframe__(timeframe + 1);

                            $C(timeframesElem)
                                .div(createAttributes('timeframe'))
                                    .act(function() { t.elem = this; })
                                    .each(__getTicks__(timeFrom, timeTo))
                                        .div(createAttributes('tick', {style: {left: function(item) { return item.left; }}}))
                                            .span()
                                                .text(function(item) { return item.label; })
                                    .end(3)
                                    .div(createAttributes('events-wrapper'))
                                        .div(createAttributes('events'))
                                            .act(function() { t.eventsElem = this; })
                                            .div(createAttributes('future-overlay'))
                                                .act(function() { t.futureElem = this; })
                            .end(5);
                        }
                    },
                    ///////////////////////////////////////////////////////////
                    ///////////////////////////////////////////////////////////
                    __removeTimeframe__ = function(timeframe, unadopted) {
                        var t = __timeframes[timeframe],
                            id,
                            event;

                        if (t) {
                            for (id in t.events) {
                                event = __events[id];
                                event.timeframe = undefined;
                                unadopted.push(event);

                                delete __events[id];
                            }

                            timeframesElem.removeChild(t.elem);

                            delete __timeframes[timeframe];
                        }
                    },
                    ///////////////////////////////////////////////////////////
                    ///////////////////////////////////////////////////////////
                    __getTimeframeWidth__ = function() {
                        if (isUndefined(__timeframeElemWidth)) {
                            __timeframeElemWidth = timeframesElem.clientWidth;
                        }
                        return ceil(__timeframeElemWidth * (1 / __viewportSize));
                    },
                    ///////////////////////////////////////////////////////////
                    ///////////////////////////////////////////////////////////
                    __adoptEvents__ = function(events) {
                        if (events.length) {
                            var i,
                                tmp,
                                event,
                                timeframeFrom,
                                timeframeTo,
                                timeframe;

                            for (i = 0; i < events.length; i++) {
                                event = events[i];

                                // Get timeframes this event goes through.
                                timeframeFrom = __getTimeframeByTime__(event.begin);
                                timeframeTo = event.begin === event.end ?
                                    timeframeFrom
                                    :
                                    __getTimeframeByTime__(isUndefined(event.end) ? __maxTime : event.end);

                                if (timeframeTo < __timeframeFrom || timeframeFrom >= __timeframeTo) {
                                    // Event is out of current timeframes, skip it.
                                    continue;
                                }

                                // Getting event's parent timeframe.
                                tmp = round((timeframeFrom + timeframeTo) / 2);
                                event.timeframe = timeframe = tmp < __timeframeFrom ?
                                    __timeframeFrom
                                    :
                                    tmp >= __timeframeTo ?
                                        __timeframeTo - 1
                                        :
                                        tmp;

                                timeframe = __timeframes[timeframe];

                                event.tbegin = timeframeFrom;
                                event.tend = timeframeTo;

                                // Adding this event to timeframe's events and to
                                // __events.
                                timeframe.events[event.id] = true;

                                if (isUndefined(event.end)) {
                                    timeframe.unfinished[event.id] = true;
                                }

                                __events[event.id] = event;

                                // Appending event's DOM nodes to timeframe's events
                                // container.
                                tmp = timeframe.eventsElem;

                                if (event.elem1) {
                                    // DOM nodes are already created.
                                    tmp.appendChild(event.elem1);
                                    tmp.appendChild(event.elem2);
                                } else {
                                    // Create new DOM nodes.
                                    $C(tmp)
                                        .div(event.color ? {style: {'background-color': event.color}} : undefined)
                                            .act(function() { event.elem1 = this; })
                                        .end()
                                        .div({'data-id': event.id, title: event.title})
                                            .act(function() { event.elem2 = this; })
                                            .each(event.marks)
                                                .span(markAttributes)
                                            .end(2)
                                            .text(event.title)
                                    .end(2);
                                }

                                // Setting class names.
                                tmp = undefined;

                                if (event.begin === event.end) {
                                    tmp = {type: 'point'};
                                }

                                event.elem2.className = bemClass('event-overlay', tmp);

                                if (isUndefined(event.end)) {
                                    tmp = {type: 'unfinished'}
                                }

                                event.elem1.className = bemClass('event', tmp);

                                // We need to position this event.
                                event.positioned = false;
                            }

                            __positionEvents__();
                        }
                    },
                    ///////////////////////////////////////////////////////////
                    ///////////////////////////////////////////////////////////
                    __getFirstTimeframeLeft__ = function() {
                        return - (__realPosition - __timeframeFrom) * __getTimeframeWidth__();
                    },
                    ///////////////////////////////////////////////////////////
                    ///////////////////////////////////////////////////////////
                    __positionTimeframes__ = function() {
                        var timeframeWidth = __getTimeframeWidth__(),
                            i,
                            left = round(__getFirstTimeframeLeft__()),
                            timeframe,
                            timeFrom,
                            timeTo,
                            cssProps;

                        if (!isUndefined(__now)) {
                            timeFrom = __getTimeByTimeframe__(__timeframeFrom);
                        }

                        for (i = __timeframeFrom; i < __timeframeTo; i++) {
                            // TODO: Assign left and width only in case they have changed
                            //       since previous __positionTimeframes__() call.

                            timeframe = __timeframes[i];

                            css(timeframe.elem, {left: left, width: timeframeWidth});

                            left += timeframeWidth;

                            if (!isUndefined(__now)) {
                                // Update future overlays positions.
                                timeTo = __getTimeByTimeframe__(i + 1);

                                cssProps = {};

                                if (__now >= timeTo) {
                                    cssProps.display = 'none';
                                } else {
                                    cssProps.display = '';
                                    cssProps.left = timeFrom >= __now ?
                                        0
                                        :
                                        round(timeframeWidth * (__now - timeFrom) / (timeTo - timeFrom));
                                }

                                css(timeframe.futureElem, cssProps);

                                timeFrom = timeTo;
                            }
                        }

                        if (__now !== __prevNow) {
                            __prevNow = __now;
                            __setUnfinishedEventsWidths__();
                        }
                    },
                    ///////////////////////////////////////////////////////////
                    ///////////////////////////////////////////////////////////
                    __positionEvents__ = function(force) {
                        var i,
                            j,
                            event,
                            item,
                            mark,
                            markLeft,
                            markPrevLeft,
                            sweepLine = [],
                            lastPositionedIndex,
                            timeframeWidth = __getTimeframeWidth__(),
                            left,
                            top,
                            rows = {},
                            hspacing = T.EVENT_HSPACING / timeframeWidth,
                            letterWidth = T.LETTER_WIDTH / timeframeWidth,
                            lookAheadRow,
                            lookAheadRows;

                        for (i in __events) {
                            event = __events[i];

                            sweepLine.push({begin: true, event: event, sort: event.tbegin});

                            if (!isUndefined(event.end)) {
                                if (force || isUndefined(event.tend2)) {
                                    // Getting event's right position.
                                    // tend is an event's end,
                                    // tend2 is a visible end (including title).
                                    event.tend2 = event.tbegin + event.title.length * letterWidth + hspacing;
                                    if (event.tend2 - event.tend < hspacing) {
                                        event.tend2 = event.tend + hspacing;
                                    }
                                }

                                sweepLine.push({begin: false, event: event, sort: event.tend2});
                            }
                        }

                        sweepLine.sort(function(a, b) {
                            return a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0;
                        });

                        lastPositionedIndex = -1;

                        for (i = 0; i < sweepLine.length; i++) {
                            item = sweepLine[i];
                            event = item.event;

                            event[item.begin ? 'i' : 'i2'] = i;

                            if (event.positioned) {
                                lastPositionedIndex = i;
                            }
                        }

                        for (i = 0; i < sweepLine.length; i++) {
                            item = sweepLine[i];
                            event = item.event;

                            if (item.begin) {
                                if (event.positioned && isUndefined(rows[event.row])) {
                                    rows[(j = event.row)] = true;
                                } else {
                                    lookAheadRows = {};

                                    if (!force && (i < lastPositionedIndex) && !event.positioned) {
                                        for (j = i + 1; j < event.i2; j++) {
                                            // TODO: Think more about this look-ahead complexity.
                                            if (!isUndefined((lookAheadRow = sweepLine[j].event.row))) {
                                                lookAheadRows[lookAheadRow] = true;
                                            }
                                        }
                                    }

                                    j = 0;

                                    while (rows[j] || lookAheadRows[j]) {
                                        j++;
                                    }

                                    rows[(event.row = j)] = true;
                                }

                                if (force || !event.positioned) {
                                    left = round((event.tbegin - event.timeframe) * timeframeWidth);
                                    top = ceil(j / 2) * (T.EVENT_HEIGHT + T.EVENT_VSPACING) * (j % 2 === 0 ? 1 : -1);

                                    css(event.elem1, {
                                        left: left,
                                        top: top,
                                        width: event.begin === event.end ? '' : (round((event.tend - event.tbegin) * timeframeWidth) || 1)
                                    });

                                    j = 0;
                                    markPrevLeft = 0;
                                    mark = event.elem2.firstChild;

                                    while (j < event.marks.length) {
                                        markLeft = round((__getTimeframeByTime__(event.marks[j]) - event.timeframe) * timeframeWidth) - left;
                                        css(mark, {
                                            left: markPrevLeft,
                                            width: markLeft - markPrevLeft
                                        });

                                        markPrevLeft = markLeft;

                                        j++;
                                        mark = mark.nextSibling;
                                    }

                                    css(event.elem2, {
                                        left: left,
                                        top: top,
                                        width: round((event.tend2 - event.tbegin) * timeframeWidth)
                                    });

                                    // Remember left position for __setUnfinishedEventsWidths__.
                                    event.left = left;

                                    event.positioned = true;
                                }
                            } else {
                                rows[event.row] = undefined;
                            }
                        }

                        __setUnfinishedEventsWidths__();
                    },
                    ///////////////////////////////////////////////////////////
                    ///////////////////////////////////////////////////////////
                    __setUnfinishedEventsWidths__ = function() {
                        if (!isUndefined(__now)) {
                            var i,
                                id,
                                unfinished,
                                timeframeWidth = __getTimeframeWidth__(),
                                timeframeFrom,
                                width,
                                event;

                            timeframeFrom = __getTimeframeByTime__(__now);

                            if (timeframeFrom >= __timeframeTo) {
                                timeframeFrom = __timeframeTo;
                            }

                            width = round((timeframeFrom - __timeframeFrom) * timeframeWidth);

                            for (i = __timeframeFrom; i < __timeframeTo; i++) {
                                unfinished = __timeframes[i].unfinished;

                                for (id in unfinished) {
                                    event = __events[id];
                                    css(event.elem1, {width: width - event.left});
                                    css(event.elem2, {width: width - event.left});
                                }

                                width -= timeframeWidth;
                            }
                        }
                    },
                    ///////////////////////////////////////////////////////////
                    ///////////////////////////////////////////////////////////
                    __getMissingTime__ = function() {
                        var timeframeFrom,
                            timeframeTo;

                        timeframeFrom = __timeframeFrom;
                        timeframeTo = __timeframeTo - 1;

                        while (timeframeFrom < __timeframeTo &&
                               !isUndefined(__timeframes[timeframeFrom].loading))
                        {
                            timeframeFrom++;
                        }

                        while (timeframeTo >= __timeframeFrom &&
                               !isUndefined(__timeframes[timeframeTo].loading))
                        {
                            timeframeTo--;
                        }

                        if (timeframeFrom <= timeframeTo) {
                            return {
                                timeframeFrom: timeframeFrom,
                                timeframeTo:   timeframeTo + 1,
                                timeFrom:      __getTimeByTimeframe__(timeframeFrom),
                                timeTo:        __getTimeByTimeframe__(timeframeTo + 1)
                            };
                        }
                    };

                ///////////////////////////////////////////////////////////////
                ///////////////////////////////////////////////////////////////
                timelineInternalObj.getPosition = function() {
                    return __position;
                };
                ///////////////////////////////////////////////////////////////
                ///////////////////////////////////////////////////////////////
                timelineInternalObj.setPosition = function(pos, animate,
                                                           animationStepCallback,
                                                           positionCallbackFirstArg)
                {
                    if (!isUndefined(animate)) {
                        var x = timelineInternalObj.getX(__position),
                            delta = abs(__position - animate),
                            offset = __position > animate ? -3 : 3,
                            minTimeDelta = abs(__position - timelineInternalObj.byX(x + offset));

                        if (delta < minTimeDelta) {
                            pos = animate;
                            animate = undefined;
                        } else {
                            pos = __position + delta / offset;
                        }
                    }

                    var prevPos,
                        timeFrom,
                        timeTo,
                        timeframeFrom,
                        timeframeTo,
                        i,
                        val,
                        unadopted = [],
                        getEventsFunc,
                        animateIsUndefined = isUndefined(animate);

                    __prevViewportSize = __viewportSize;

                    __curAnimationDestination = animate;
                    __curAnimationStepCallback = animationStepCallback;
                    __curPositionCallbackFirstArg = positionCallbackFirstArg;

                    prevPos = __position;

                    __realPosition = __getTimeframeByTime__(pos < __minTime ? __minTime : (pos > __maxTime ? __maxTime : pos)) - __viewportSize / 2;

                    if (__realPosition > (pos = (__getTimeframeByTime__(__maxTime) - __viewportSize))) {
                        __realPosition = pos;
                    }

                    if (__realPosition < (pos = __getTimeframeByTime__(__minTime))) {
                        __realPosition = pos;
                    }

                    __position = __getTimeByTimeframe__(__realPosition + __viewportSize / 2);
                    if (__position > __maxTime) {
                        __position = __maxTime;
                    }

                    pos = __realPosition;

                    timeFrom = __getTimeByTimeframe__(floor(pos - __preloadBefore));
                    timeTo = __getTimeByTimeframe__(ceil(pos + __viewportSize + __preloadAfter));

                    if (timeFrom < __minTime) {
                        timeFrom = __minTime;
                    }

                    if (timeTo > __maxTime) {
                        timeTo = __maxTime;
                    }

                    timeframeFrom = floor(__getTimeframeByTime__(timeFrom));
                    timeframeTo = ceil(__getTimeframeByTime__(timeTo));

                    for (i = timeframeFrom; i < timeframeTo; i++) {
                        __addTimeframe__(i);
                    }

                    if (!isUndefined(__timeframeFrom)) {
                        for (i = __timeframeFrom; i < timeframeFrom; i++) {
                            __removeTimeframe__(i, unadopted);
                        }

                        for (i = timeframeTo; i < __timeframeTo; i++) {
                            __removeTimeframe__(i, unadopted);
                        }
                    }

                    __timeframeFrom = timeframeFrom;
                    __timeframeTo = timeframeTo;

                    __positionTimeframes__();
                    __adoptEvents__(unadopted);

                    if ((val = __getMissingTime__())) {
                        if (__getEventsTimer) {
                            window.clearTimeout(__getEventsTimer);
                        }

                        getEventsFunc = function() {
                            __getEventsTimer = undefined;

                            timeFrom = val.timeFrom;
                            timeTo = val.timeTo;

                            timelineInternalObj.status(timeFrom, timeTo, true, false);

                            __getEvents__(timeFrom, timeTo);
                        };

                        // In case of animation we're probably jumping through
                        // quite fast. So, we need to request events only when
                        // animation stops.
                        if (animateIsUndefined) {
                            getEventsFunc();
                        } else {
                            __getEventsTimer = window.setTimeout(getEventsFunc, 55);
                        }
                    }

                    if (!animateIsUndefined && __position !== prevPos) {
                        window.requestAnimationFrame(
                            function() {
                                if (!isUndefined(__curAnimationDestination)) {
                                    timelineInternalObj.setPosition(
                                        undefined,
                                        __curAnimationDestination,
                                        __curAnimationStepCallback,
                                        __curPositionCallbackFirstArg
                                    );
                                }
                            }
                        );
                    }

                    if (animationStepCallback) {
                        animationStepCallback(__position, prevPos);
                    }

                    if (positionCallback) {
                        positionCallback(
                            positionCallbackFirstArg,
                            !animateIsUndefined,
                            __position,
                            prevPos);
                    }

                    return __position;
                };
                ///////////////////////////////////////////////////////////////
                ///////////////////////////////////////////////////////////////
                timelineInternalObj.status = function(timeFrom, timeTo, loading, error) {
                    var timeframeFrom = floor(__getTimeframeByTime__(timeFrom)),
                        timeframeTo = floor(__getTimeframeByTime__(timeTo)),
                        timeframe,
                        i;

                    for (i = timeframeFrom; i < timeframeTo; i++) {
                        if ((timeframe = __timeframes[i])) {
                            if (!loading || error) {
                                if (timeframe.loading) {
                                    (function(elem) {
                                        window.setTimeout(function() {
                                            elem.className = bemClass('timeframe');
                                        }, 0);
                                    })(timeframe.elem);

                                    timeframe.loading = false;
                                }

                                if (error) {
                                    timeframe.error = true;
                                }
                            }

                            if (loading) {
                                timeframe.elem.className = bemClass('timeframe', {loading: true});
                                timeframe.loading = true;
                            }

                            if (!error) {
                                timeframe.error = false;
                            }
                        }
                    }

                    if (!error) {
                        for (i = __timeframeFrom; i < __timeframeTo; i++) {
                            if (__timeframes[i].error) {
                                return true;
                            }
                        }
                    }

                    return error;
                };
                ///////////////////////////////////////////////////////////////
                ///////////////////////////////////////////////////////////////
                timelineInternalObj.events = function(callback) {
                    __getEvents__ = callback;
                };
                ///////////////////////////////////////////////////////////////
                ///////////////////////////////////////////////////////////////
                timelineInternalObj.timing = function(getTimeByTimeframe, getTimeframeByTime, getTicks) {
                    __getTimeByTimeframe__ = getTimeByTimeframe;
                    __getTimeframeByTime__ = getTimeframeByTime;
                    __getTicks__           = getTicks;
                };
                ///////////////////////////////////////////////////////////////
                ///////////////////////////////////////////////////////////////
                timelineInternalObj.bounds = function(viewportSize, preloadBefore, preloadAfter) {
                    __viewportSize  = viewportSize;
                    __preloadBefore = preloadBefore;
                    __preloadAfter  = preloadAfter;
                };
                ///////////////////////////////////////////////////////////////
                ///////////////////////////////////////////////////////////////
                timelineInternalObj.push = function(timeFrom, timeTo, events) {
                    var i,
                        event,
                        newEvent,
                        unadopted = [];

                    for (i = 0; i < events.length; i++) {
                        event = events[i];

                        if (isUndefined(event.begin) && isUndefined(event.end)) {
                            continue;
                        }

                        newEvent = {
                            id:         event.id,
                            data:       event.data,
                            title:      event.title ? event.title + '' : '',
                            begin:      isUndefined(event.begin) ? event.end : event.begin,
                            end:        event.end,
                            marks:      Array.prototype.slice.call(event.marks || [], 0),
                            color:      event.color,
                            //row:        undefined,
                            //tbegin:     undefined,
                            //tend:       undefined,
                            //elem1:      undefined,
                            //elem2:      undefined,
                            //left:       undefined,
                            positioned: false
                        };

                        if ((event = __events[newEvent.id])) {
                            event.data = newEvent.data;

                            if (event.title === newEvent.title &&
                                event.begin === newEvent.begin &&
                                event.end === newEvent.end &&
                                event.color === newEvent.color &&
                                event.marks.length === newEvent.marks.length)
                            {
                                continue;
                            }

                            __removeEvent__(newEvent.id, true);

                            newEvent.row = event.row; // Keep the row if possible.

                            // Event's DOM nodes are already created, no need to create
                            // them again.
                            newEvent.elem1 = event.elem1;
                            css(newEvent.elem1, {'background-color': newEvent.color || ''});

                            if (event.title !== newEvent.title ||
                                newEvent.marks.length !== event.marks.length)
                            {
                                $C(newEvent.elem2, true)
                                    .each(newEvent.marks)
                                        .span(markAttributes)
                                    .end(2)
                                    .text(newEvent.title)
                                .end();
                            }

                            newEvent.elem2 = event.elem2;
                        }

                        newEvent.marks.sort();

                        unadopted.push(newEvent);
                    }

                    __adoptEvents__(unadopted);

                    return timelineInternalObj.status(timeFrom, timeTo, false, false);
                };
                ///////////////////////////////////////////////////////////////
                ///////////////////////////////////////////////////////////////
                timelineInternalObj.update = function(setStatus) {
                    var timeFrom = __getTimeByTimeframe__(__timeframeFrom),
                        timeTo = __getTimeByTimeframe__(__timeframeTo);

                    timelineInternalObj.setPosition(__position);

                    if (setStatus) {
                        timelineInternalObj.status(timeFrom, timeTo, true, false);
                    }

                    __getEvents__(timeFrom, timeTo);
                };
                ///////////////////////////////////////////////////////////////
                ///////////////////////////////////////////////////////////////
                timelineInternalObj.getX = function(time) {
                    // Returns left position in pixels for time.
                    return round(
                        (__getTimeframeByTime__(time) - __timeframeFrom) * __getTimeframeWidth__() +
                        __getFirstTimeframeLeft__() + 10
                    );
                };
                ///////////////////////////////////////////////////////////////
                ///////////////////////////////////////////////////////////////
                timelineInternalObj.byX = function(x) {
                    // Returns time for left position in pixels.
                    var timeframeWidth = __getTimeframeWidth__();

                    return __getTimeByTimeframe__(
                        (x + __timeframeFrom * timeframeWidth - __getFirstTimeframeLeft__() - 10) / timeframeWidth
                    );
                };
                ///////////////////////////////////////////////////////////////
                ///////////////////////////////////////////////////////////////
                timelineInternalObj.resize = function() {
                    if (timeframesElem.clientWidth !== __timeframeElemWidth ||
                        __prevViewportSize !== __viewportSize)
                    {
                        __timeframeElemWidth = undefined;
                        timelineInternalObj.setPosition(__position);
                        __positionEvents__(true);
                    }
                };
                ///////////////////////////////////////////////////////////////
                ///////////////////////////////////////////////////////////////

                bindEventFunc(timeframesElem, 'mousedown', function(e) {
                    mousedownX = e.pageX;
                });

                bindEventFunc(timeframesElem, 'mousemove', function(e) {
                    if (!isUndefined(mousedownX) && !isUndefined(__viewportSize) && e.pageX !== mousedownX) {
                        timelineInternalObj.setPosition(
                            __getTimeByTimeframe__(
                                __getTimeframeByTime__(__position) +
                                (mousedownX - e.pageX) / __getTimeframeWidth__()
                            )
                        );
                        mousedownX = e.pageX;
                        mousemoved = true;
                    }
                });

                bindEventFunc(timeframesElem, 'mouseup', function(e) {
                    if (!mousemoved && clickCallback) {
                        var target = e.target,
                            className = target.className || '',
                            what,
                            overlayElem,
                            id,
                            markIndex,
                            event,
                            elem = timeframesElem,
                            w = e.pageX - round(__getFirstTimeframeLeft__()) - 1;

                        while (elem) {
                            w -= elem.offsetLeft;
                            elem = elem.offsetParent;
                        }

                        if (className.indexOf(bemClass('event-overlay')) >= 0) {
                            what = 'event';
                        } else if (className.indexOf(bemClass('mark')) >= 0) {
                            what = 'mark';
                        }

                        switch (what) {
                            case 'mark':
                                overlayElem = target.parentNode;
                                markIndex = target.getAttribute('data-index');

                            case 'event':
                                id = (overlayElem || target).getAttribute('data-id');

                                if (id && __clickCallback) {
                                    event = __events[id];

                                    if (what === 'event' && event.marks.length) {
                                        markIndex = event.marks.length;
                                    }
                                }

                                break;
                        }

                        clickCallback(
                            e,
                            __getTimeByTimeframe__(w / __getTimeframeWidth__() + __timeframeFrom),
                            id,
                            markIndex,
                            (__events[id] || {}).data
                        );
                    }
                });

                bindEventFunc(document, 'mouseup', function(e) {
                    mousedownX = mousemoved = undefined;
                });

                bindEventFunc(leftElem, 'click', function() {
                    timelineInternalObj.setPosition(
                        undefined,
                        __getTimeByTimeframe__(
                            __getTimeframeByTime__(__position) - __viewportSize * 0.4
                        )
                    );
                });

                bindEventFunc(rightElem, 'click', function() {
                    timelineInternalObj.setPosition(
                        undefined,
                        __getTimeByTimeframe__(
                            __getTimeframeByTime__(__position) + __viewportSize * 0.4
                        )
                    );
                });

                bindMouseWheel(timeframesElem, function(delta) {
                    if (!isUndefined(__minTime)) {
                        timelineInternalObj.setPosition(
                            __getTimeByTimeframe__(
                                __getTimeframeByTime__(__position) + __viewportSize * delta * 0.002
                            )
                        );
                    }
                });

                if (keyboardControl) {
                    bindEventFunc(document, 'keydown', function(e) {
                        var move;

                        switch (e.which) {
                            case 37:
                                move = -1;
                                break;

                            case 39:
                                move = 1;
                                break;
                        }

                        if (move) {
                            timelineInternalObj.setPosition(
                                __getTimeByTimeframe__(
                                    __getTimeframeByTime__(__position) +
                                    move * __viewportSize * (e.shiftKey ? 0.4 : 0.05)
                                )
                            );
                        }
                    });
                }
            },

            __evaluateBounds__ = function() {
                var key,
                    val;

                __evaluatedBounds = {};

                for (key in __bounds) {
                    // TODO: Check values.
                    __evaluatedBounds[key] = isFunction(val = __bounds[key]) ? val() : val;
                }

                __minTime    = __evaluatedBounds.minTime;
                __maxTime    = __evaluatedBounds.maxTime;
                __now        = __evaluatedBounds.now;
                __autoUpdate = __evaluatedBounds.autoUpdate;

                val = new Date(__minTime);
                __actualMinTime = new Date(
                    val.getFullYear(),
                    val.getMonth(),
                    val.getDate()
                ).getTime();

                __mainView.bounds(
                    __evaluatedBounds.viewport,
                    __evaluatedBounds.preloadBefore,
                    __evaluatedBounds.preloadAfter
                );

                __scrollBar.bounds(
                    __evaluatedBounds.scrollViewport,
                    __evaluatedBounds.scrollPreloadBefore,
                    __evaluatedBounds.scrollPreloadAfter
                );
            },

            __scheduleUpdate__ = function() {
                if (__autoUpdateTimer) {
                    window.clearTimeout(__autoUpdateTimer);
                    __autoUpdateTimer = undefined;
                }

                if (__autoUpdate > 0) {
                    __autoUpdateTimer = window.setTimeout(function() {
                        __autoUpdateTimer = undefined;
                        __evaluateBounds__();
                        __mainView.update();
                    }, __autoUpdate);
                }
            };

        ///////////////////////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////
        timelineObj.bounds = function(bounds) {
            if (!isUndefined(bounds)) {
                var key,
                    b;

                for (key in __bounds) {
                    if (!isUndefined((b = bounds[key]))) {
                        __bounds[key] = b;
                    }
                }
            }

            __evaluateBounds__();

            css(__scalerElem, {display: isUndefined(__evaluatedBounds.minViewport) || isUndefined(__evaluatedBounds.maxViewport) ? 'none' : 'block'});

            return timelineObj;
        };
        ///////////////////////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////
        timelineObj.events = function(callback) {
            __mainView.events(bind(timelineObj, callback));

            return timelineObj;
        };
        ///////////////////////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////
        timelineObj.timing = function(getTimeByTimeframe, getTimeframeByTime, getTicks) {
            __mainView.timing(getTimeByTimeframe, getTimeframeByTime, getTicks);

            return timelineObj;
        };
        ///////////////////////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////
        timelineObj.position = function(pos) {
            if (isUndefined(pos)) {
                return __mainView.getPosition();
            } else {
                __evaluateBounds__();

                __mainView.setPosition(pos);

                return timelineObj;
            }
        };
        ///////////////////////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////
        timelineObj.push = function(timeFrom, timeTo, events) {
            __mainViewError = __mainView.push(timeFrom, timeTo, events);

            if (!__mainViewError) {
                css(__errorElem, {display: 'none'});
            }

            __scheduleUpdate__();

            return timelineObj;
        };
        ///////////////////////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////
        timelineObj.error = function(timeFrom, timeTo, message) {
            css(__errorElem, {display: 'block'});

            $C(__errorElem.firstChild, true)
                .text(message)
            .end();

            __mainViewError = __mainView.status(timeFrom, timeTo, false, true);

            __scheduleUpdate__();

            return timelineObj;
        };
        ///////////////////////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////
        timelineObj.resize = function() {
            __evaluateBounds__();
            __mainView.resize();
            __scrollBar.resize();

            return timelineObj;
        };
        ///////////////////////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////
        timelineObj.on = function(what, callback) {
            callback = bind(timelineObj, callback);

            switch (what) {
                case 'click':
                    __clickCallback = callback;
                    break;

                case 'position':
                    __positionCallback = callback;
                    break;
            }

            return timelineObj;
        };
        ///////////////////////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////

        var bindZoomClick = function() {
            var self = this;
            bindEventFunc(self, 'click', function() {
                if (__evaluatedBounds) {
                    var viewport = __evaluatedBounds.viewport,
                        minViewport = __evaluatedBounds.minViewport,
                        maxViewport = __evaluatedBounds.maxViewport;

                    if (!isUndefined(minViewport) && !isUndefined(maxViewport)) {
                        viewport += 0.1 * (self.className.indexOf('zoom-in') > 0 ? -1 : 1);
                        if (viewport < minViewport) {
                            viewport = minViewport;
                        }
                        if (viewport > maxViewport) {
                            viewport = maxViewport;
                        }
                        timelineObj.bounds({viewport: viewport});
                        timelineObj.resize();
                    }
                }
            });
        };

        $C(container, true)
            .div(createAttributes())
                .act(function() { __elem = this; })
                .div(createAttributes('error-wrapper'))
                    .act(function() { __errorElem = this; })
                        .span(createAttributes('error'))
                .end(2)
                .div(createAttributes('scaler'))
                    .act(function() { __scalerElem = this; })
                    .div(createAttributes('scaler-button', undefined, {'zoom-out': true}))
                        .act(bindZoomClick)
                    .end()
                    .div(createAttributes('scaler-button', undefined, {'zoom-in': true}))
                        .act(bindZoomClick)
                    .end()
                    .div(createAttributes('scaler-ruler'))
                .end(2)
                .div(createAttributes('left'))
                    .act(function() { __mainViewLeftElem = this;  })
                    .div()
                .end(2)
                .div(createAttributes('right'))
                    .act(function() { __mainViewRightElem = this;  })
                    .div()
                .end(2)
                .div(createAttributes('timeframes'))
                    .act(function() {
                        __mainView = new TimelineInternal(
                            this,
                            __mainViewLeftElem,
                            __mainViewRightElem,

                            true,

                            function(e, pos, id, markIndex, data) {
                                if (!isUndefined(id) && __clickCallback) {
                                    __clickCallback(e, id, markIndex, data);
                                }
                            },

                            function(customArg, isAnimation, pos, prev) {
                                if (pos !== prev) {
                                    if (!customArg) {
                                        __scrollBar.setPosition(
                                            isUndefined(prev) ?
                                                pos
                                                :
                                                __scrollBar.getPosition() + (pos - prev)
                                        );
                                    }

                                    if (__positionCallback && !isAnimation) {
                                        __positionCallback(pos, prev);
                                    }
                                }
                            }
                        );
                    })
                .end()
                .div(createAttributes('gap'), true)
                .div(createAttributes('pick'))
                    .act(function() { __pickElem = this; })
                .end()
                .div(createAttributes('left', undefined, {scrollbar: true}))
                    .act(function() { __scrollBarLeftElem = this;  })
                    .div()
                .end(2)
                .div(createAttributes('right', undefined, {scrollbar: true}))
                    .act(function() { __scrollBarRightElem = this;  })
                    .div()
                .end(2)
                .div(createAttributes('scrollbar'))
                    .act(function() {
                        __scrollBar = new TimelineInternal(
                            this,
                            __scrollBarLeftElem,
                            __scrollBarRightElem,

                            undefined,

                            function(e, pos) {
                                __mainView.setPosition(
                                    undefined,
                                    pos,
                                    function(pos) { css(__pickElem, {left: __scrollBar.getX(pos) - 7}); },
                                    true
                                );
                            },

                            function() {
                                css(__pickElem, {left: round(__scrollBar.getX(__mainView.getPosition())) - 7});
                            }
                        );
                    })
        .end(3);

        bindEventFunc(__errorElem, 'click', function() {
            __mainView.update(true);
        });

        __mainView.timing(
            function(timeframe) {
                // __getTimeByTimeframe__ for main view.
                return timeframe * _24hours + __actualMinTime % _24hours;
            },
            ///////////////////////////////////////////////////////////////////
            function(time) {
                // __getTimeframeByTime__ for main view.
                return (time - __actualMinTime % _24hours) / _24hours;
            },
            ///////////////////////////////////////////////////////////////////
            function(timeFrom, timeTo) {
                // __getTicks__ for main view.
                var d = new Date(timeFrom);
                defaultTicks[0].label = months[d.getMonth()] + ' ' + d.getDate() + ' ' + d.getFullYear();
                return defaultTicks;
            }
        );

        __scrollBar.timing(
            function(timeframe) {
                // __getTimeByTimeframe__ for scrollbar.
                var timeFrom = new Date(floor(timeframe), 0, 1).getTime(),
                    timeTo = new Date(floor(timeframe) + 1, 0, 1).getTime();

                return timeFrom + (timeTo - timeFrom) * (timeframe - floor(timeframe));
            },
            ///////////////////////////////////////////////////////////////////
            function(time) {
                // __getTimeframeByTime__ for scrollbar.
                var year = new Date(time).getFullYear(),
                    timeFrom = new Date(year, 0, 1),
                    timeTo = new Date(year + 1, 0, 1);

                return year + (time - timeFrom) / (timeTo - timeFrom);
            },
            ///////////////////////////////////////////////////////////////////
            function(timeFrom, timeTo) {
                // __getTicks__ for scrollbar.
                var d = new Date(timeFrom),
                    i,
                    ret = [];

                for (i = 0; i < 12; i++) {
                    d.setMonth(i);
                    ret.push({
                        left: 100 * (d.getTime() - timeFrom) / (timeTo - timeFrom) + '%',
                        label: months[d.getMonth()] + (i % 3 === 0 ? ', ' + d.getFullYear() : '')
                    });
                }

                return ret;
            }
        );

        bindEventFunc(window, 'resize', function() {
            if (__resizeTimer) {
                window.clearTimeout(__resizeTimer);
            }

            __resizeTimer = window.setTimeout(function() {
                __resizeTimer = undefined;
                timelineObj.resize();
            }, 100);
        });
    };

    T.EVENT_HEIGHT = 30;
    T.EVENT_HSPACING = 30;
    T.EVENT_VSPACING = 5;
    T.LETTER_WIDTH = 7.5;
})(window, document);
