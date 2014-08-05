DATA = null;

function timeformat(value) {
  if (value > 120 * 1000) {
    // 2 min
    return d3.format(".3r")(value / 1000 / 60) + "min";
  } else if (value > 1500) {
    return d3.format(".3r")(value / 1000) + "s";
  } else {
    return d3.format(".3r")(value) + "ms";
  }
}

function onlyUnique(value, index, self) {
  return self.indexOf(value) === index;
}

function process(raw, name) {
  // process raw data from pytest-json-report, and flatten it a bit
  // for latter nesting.
  // name: will be the name of the uploaded file.

  var data = [];

  for (test of raw["tests"]) {
    var xa = test["nodeid"].split("::");
    file = xa[0];
    group = xa[1];
    for (k of ["call", "setup", "teardown"]) {
      try {
        var item = {};
        item.key = file;
        item.group = group;
        item.kind = k;
        item.value = test[k].duration * 1000;
        item.outcome = test[k].outcome;
        item.name = name;
        data.push(item);
      } catch (e) {
        //console.log(
        //  "test",
        //  k,
        //  "may not have duration ? likely skipped test",
        //  test,
        //  k
        //);
      }
    }
  }
  return data;
}

function readFileAsync(file) {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result);
    };

    reader.onerror = reject;

    reader.readAsArrayBuffer(file);
  });
}

function dropHandler(ev) {
  // we let user drop file,
  // and will process them.

  // Prevent default behavior (Prevent file from being opened)
  ev.preventDefault();

  // right now we'll use the global DATA declaration.
  DATA = [];

  if (ev.dataTransfer.items) {
    // Use DataTransferItemList interface to access the file(s)
    var processing_count = ev.dataTransfer.items.length;
    var processed = 0;
    for (var i = 0; i < ev.dataTransfer.items.length; i++) {
      // If dropped items aren't files, reject them
      if (ev.dataTransfer.items[i].kind === "file") {
        var file = ev.dataTransfer.items[i].getAsFile();
        const name = file.name;
        const fr = new FileReader();
        fr.onloadend = function () {
          raw = JSON.parse(this.result);

          DATA = DATA.concat(process(raw, name));
          processed += 1;
          if (processed == processing_count) {
            init();
          }
        };

        fr.readAsText(file);
      }
    }
  } else {
    // Use DataTransfer interface to access the file(s)
  }
}

function dragOverHandler(ev) {
  // Prevent default behavior (Prevent file from being opened)
  ev.preventDefault();
}

window.addEventListener("message", function (e) {
  var opts = e.data.opts,
    data = e.data.data;

  return main(opts, data);
});

var defaults = {
  margin: {
    top: 24,
    right: 10,
    bottom: 0,
    left: 10,
  },
  rootname: "TOP",
  format: ".3r",
  title: "",
};

function main(opts, data) {
  var root,
    opts = $.extend(true, {}, defaults, opts),
    formatNumber = d3.format(opts.format),
    rname = opts.rootname,
    margin = opts.margin,
    theight = 1;

  var ww = window.innerWidth - 20;
  var hh = window.innerHeight - 110;
  $("#chart").width(ww).height(hh);
  let width = ww - margin.left - margin.right + 22;
  let height = hh - margin.top - margin.bottom - theight;
  let transitioning;

  var color = d3.scale.category10();
  //var color = d3.scale.linear(0, 100);

  var x = d3.scale.linear().domain([0, width]).range([0, width]);

  var y = d3.scale.linear().domain([0, height]).range([0, height]);

  var treemap = d3.layout
    .treemap()
    //.tile(d3[document.getElementById("layout").value])
    .children(function (d, depth) {
      return depth ? null : d._children;
    })
    .sort(function (a, b) {
      return a.value - b.value;
    })
    .ratio((height / width) * 0.5 * (1 + Math.sqrt(5)))
    .round(false);

  d3.select("#chart>svg").remove();
  d3.select("#chart>p").remove();
  var svg = d3
    .select("#chart")
    .append("svg")
    .style("font", "14px sans-serif")
    .style("fill", "white")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.bottom + margin.top)
    .style("margin-left", -margin.left + "px")
    .style("margin-right", -margin.right + "px")
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
    .style("shape-rendering", "crispEdges");

  var grandparent = svg.append("g").attr("class", "grandparent");

  grandparent
    .append("rect")
    .attr("y", -margin.top)
    .attr("width", width)
    .attr("height", margin.top);

  grandparent
    .append("text")
    .attr("x", 6)
    .attr("y", 6 - margin.top)
    .attr("dy", ".75em");

  if (opts.title) {
    $("#chart").prepend("<p class='title'>" + opts.title + "</p>");
  }
  if (data instanceof Array) {
    console.info("INIT", data);
    root = {
      key: rname,
      _compute: data,
    };
  } else {
    root = data;
  }

  initialize(root);
  flatten(root);
  layout(root, 2);
  display(root);

  if (window.parent !== window) {
    var myheight =
      document.documentElement.scrollHeight || document.body.scrollHeight;
    window.parent.postMessage(
      {
        height: myheight,
      },
      "*"
    );
  }

  function initialize(root) {
    root.x = root.y = 0;
    root.dx = width;
    root.dy = height;
    root.depth = 0;
  }

  // Aggregate the values for internal nodes. This is normally done by the
  // treemap layout, but not here because of our custom implementation.
  // We also take a snapshot of the original children (_children) to avoid
  // the children being overwritten when when layout is computed.

  function flatten(d) {
    // not an array
    if (d.value >= 0) {
      return [[d.value], [d.outcome]];
    }
    acc = d.values
      ? d.values.reduce(
          function (previous, current, index, array) {
            _t = flatten(current);
            value = _t[0];
            outcome = _t[1];
            return [previous[0].concat(value), previous[1].concat(outcome)];
          },
          [[], []]
        )
      : [[0], ["passed"]];
    let total = acc[0].reduce((a, b) => a + b);
    d.value = total;
    //d.value = Math.max(...acc[0]);
    d.outcome = acc[1].reduce(function (p, c) {
      if (p == c) {
        return c;
      } else {
        console.log("PC", p, c);
        return "mixed";
      }
    }, "passed");

    if (d.outcome == "mixed") {
      console.log(acc[1].filter(onlyUnique));
    }
    d._children = d.values ? d.values : d.value;
    d._children.forEach((element) => {
      element.prct = element.value / total;
    });
    //d._children = d.values ? d.values : d.value;
    return acc;
  }

  // Compute the treemap layout recursively such that each group of siblings
  // uses the same size (1×1) rather than the dimensions of the parent cell.
  // This optimizes the layout for the current zoom state. Note that a wrapper
  // object is created for the parent node for each group of siblings so that
  // the parent’s dimensions are not discarded as we recurse. Since each group
  // of sibling was laid out in 1×1, we must rescale to fit using absolute
  // coordinates. This lets us use a viewport to zoom.
  function layout(d) {
    if (d._children) {
      treemap.nodes({
        _children: d._children,
      });
      d._children.forEach(function (c) {
        c.x = d.x + c.x * d.dx;
        c.y = d.y + c.y * d.dy;
        c.dx *= d.dx;
        c.dy *= d.dy;
        c.parent = d;
        layout(c);
      });
    }
  }

  function display(d) {
    grandparent
      .datum(d.parent)
      .on("click", transition)
      .select("text")
      .text(name(d));

    var g1 = svg.insert("g", ".grandparent").datum(d).attr("class", "depth");

    var g = g1.selectAll("g").data(d._children).enter().append("g");

    g.filter(function (d) {
      return d._children;
    })
      .classed("children", true)
      .on("click", transition);

    var children = g
      .selectAll(".child")
      .data(function (d) {
        return d._children || [d];
      })
      .enter()
      .append("g");

    children
      .append("rect")
      .attr("class", "child")
      .call(rect)
      .append("title")
      .text(function (d) {
        return (
          d.parent.key +
          "\n" +
          //'Group:'+d.goup+'\n'+
          //'Kind:'+d.kind+'\n'+
          //'Name:'+d.name+"\n"+
          "(" +
          timeformat(d.parent.value) +
          " - " +
          d3.format(".3r")(d.parent.prct * 100) +
          "%" +
          ")" +
          "\n--\n" +
          d.key +
          "\n" +
          //'Group:'+d.goup+'\n'+
          //'Kind:'+d.kind+'\n'+
          //'Name:'+d.name+"\n"+
          "(" +
          timeformat(d.value) +
          " - " +
          d3.format(".3r")(d.prct * 100) +
          "%" +
          ")"
        );
      });
    children
      .append("text")
      .attr("class", "ctext")
      .text(function (d) {
        return d.key;
      })
      .call(text2);

    g.append("rect").attr("class", "parent").call(rect);

    var t = g.append("text").attr("class", "ptext").attr("dy", ".75em");

    t.append("tspan").text(function (d) {
      return d.key;
    });
    t.append("tspan")
      .attr("dy", "1.0em")
      .text(function (d) {
        return (
          timeformat(d.value) + " - " + d3.format(".3r")(d.prct * 100) + "%"
        );
      });
    t.call(text);

    g.selectAll("rect").style("fill", function (d) {
      //return "#e53935";
      return d.outcome == "passed"
        ? "#00cc00"
        : d.outcome == "failed"
        ? "#cc0000"
        : "#FFA500";
      return color(1);
    });

    function transition(d) {
      if (transitioning || !d) return;
      transitioning = true;

      var g2 = display(d),
        t1 = g1.transition().duration(250),
        t2 = g2.transition().duration(250);

      // Update the domain only after entering new elements.
      x.domain([d.x, d.x + d.dx]);
      y.domain([d.y, d.y + d.dy]);

      // Enable anti-aliasing during the transition.
      svg.style("shape-rendering", null);

      // Draw child nodes on top of parent nodes.
      svg.selectAll(".depth").sort(function (a, b) {
        return a.depth - b.depth;
      });

      // Fade-in entering text.
      g2.selectAll("text").style("fill-opacity", 0);

      // Transition to the new view.
      t1.selectAll(".ptext").call(text).style("fill-opacity", 0);
      t1.selectAll(".ctext").call(text2).style("fill-opacity", 0);
      t2.selectAll(".ptext").call(text).style("fill-opacity", 1);
      t2.selectAll(".ctext").call(text2).style("fill-opacity", 1);
      t1.selectAll("rect").call(rect);
      t2.selectAll("rect").call(rect);

      // Remove the old node when the transition is finished.
      t1.remove().each("end", function () {
        svg.style("shape-rendering", "crispEdges");
        transitioning = false;
      });
    }

    return g;
  }

  function text(text) {
    text.selectAll("tspan").attr("x", function (d) {
      return x(d.x) + 6;
    });
    text
      .attr("x", function (d) {
        return x(d.x) + 6;
      })
      .attr("y", function (d) {
        return y(d.y) + 6;
      })
      .style("opacity", function (d) {
        return this.getComputedTextLength() < x(d.x + d.dx) - x(d.x) ? 1 : 0;
      });
  }

  function text2(text) {
    text
      .attr("x", function (d) {
        return x(d.x + d.dx) - this.getComputedTextLength() - 6;
      })
      .attr("y", function (d) {
        return y(d.y + d.dy) - 6;
      })
      .style("opacity", function (d) {
        return this.getComputedTextLength() < x(d.x + d.dx) - x(d.x) ? 1 : 0;
      });
  }

  function rect(rect) {
    rect
      .attr("x", function (d) {
        return x(d.x);
      })
      .attr("y", function (d) {
        return y(d.y);
      })
      .attr("width", function (d) {
        return x(d.x + d.dx) - x(d.x);
      })
      .attr("height", function (d) {
        return y(d.y + d.dy) - y(d.y);
      });
  }

  function name(d) {
    return d.parent
      ? name(d.parent) +
          " / " +
          d.key +
          " (" +
          timeformat(d.value) +
          " - " +
          d3.format(".3r")(d.prct * 100) +
          "%)"
      : d.key + " (" + timeformat(d.value) + ")";
  }
}

var init = function (err, res) {
  res = JSON.parse(JSON.stringify(DATA));

  res.map(function (res) {
    let ind = res.group.indexOf("[");
    if (ind != -1) {
      res.param = res.group.slice(ind + 1, res.group.length - 1);
      res.group = res.group.slice(0, ind);
    } else {
      res.param = "No-parameters";
    }
  });

  var n = d3.nest();

  for (const i of ["sZ", "sA", "sB", "sC", "sD"]) {
    let vv = document.getElementById(i).value;
    if (vv == "rollup") {
      continue;
    }

    n = n.key(function (d) {
      return d[vv];
    });
  }
  n = n.rollup(function (v) {
    res = d3.sum(v, (x) => x.value);
    red = v.reduce(function (previous, current) {
      if (current.outcome == "skipped") {
        return "passed";
      }
      return previous == current.outcome ? previous : "mixed";
    }, v[0].outcome);
    return [
      {
        key: "",
        outcome: red,
        value: res,
      },
    ];
  });
  var data = n.entries(res);
  main(
    {
      //title: "Pytest Time breakdown"
    },
    {
      key: "Total",
      values: data,
    }
  );
};

//if (window.location.hash === "") {
//    //d3.json("x.json", function(err, data) {
//    //    DATA = data;
//    //    console.log("HERE", DATA)
//    //    init()
//    //});
//}

window.onresize = init;
document.getElementById("sZ").addEventListener("change", init);
document.getElementById("sA").addEventListener("change", init);
document.getElementById("sB").addEventListener("change", init);
document.getElementById("sC").addEventListener("change", init);
document.getElementById("sD").addEventListener("change", init);
//document.getElementById("layout").addEventListener("change", init)
