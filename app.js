var
  ws,
  global_tables,
  grid,
  grid_options,
  content_grid,
  content_grid_options,
  db_host,
  current_database,
  current_table,
  editor,
  resp_field_types,
  prevent_table_restore,
  basic_user,
  host_password,
  external_where,
  pending = {};

$(function() {
  window.onhashchange = function() {
    var old_db_host = db_host;
    parseHash();
    if (old_db_host != db_host) {
      window.location.reload();
    }
  }

  if (window.location.hash) {
    external_where = parseHash();
  } else {
    db_host = prompt('Host:', 'http://127.0.0.1:8123/');
    if (!db_host) {
      alert('You must enter host name. The interface will not work without it. Reload page and try again.');
      return;
    }
    window.location.hash = db_host;
  }

  if (db_host.indexOf('basic_user=') >= 0) {
    var regex = /basic_user=([^&]+)/g
    var match = regex.exec(db_host)
    basic_user = decodeURIComponent(match[1])
    document.getElementById('password_prompt').style.display = '';
    return;
  }

  if (db_host.indexOf('user=') >= 0 && db_host.indexOf('password=') < 0) {
    document.getElementById('password_prompt').style.display = '';
    return;
  }

  init();
})

function init() {
  document.getElementById('password_prompt').style.display = 'none';

  registerAltKeys();

  $('#query').keydown(function(ev) {
    if ((ev.metaKey || ev.ctrlKey) && ev.keyCode == 13 /* Cmd+Enter */) {
      submitQuery();
      return false;
    }
  })

  $('#search').bind({keyup: filterTables, mouseup: filterTables});

  var last_q = localGetKey('last_query');

  var langTools = ace.require("ace/ext/language_tools");
  editor = ace.edit("query");
  editor.session.setMode("ace/mode/clickhouse"); // imported from tabix
  editor.setOptions({
    enableBasicAutocompletion: true,
    enableSnippets: true,
    enableLiveAutocompletion: true
  });
  if (last_q) {
    editor.setValue(last_q, 1);
  }

  var wpoffset = 0;

  $('#smyles_dragbar').mousedown(function (e) {
    e.preventDefault();
    window.dragging = true;

    var smyles_editor = $('#query');
    var top_offset = smyles_editor.offset().top - wpoffset;

    // Set editor opacity to 0 to make transparent so our wrapper div shows
    smyles_editor.css('opacity', 0);

    // handle mouse movement
    $(document).mousemove(function (e) {
      var actualY = e.pageY - wpoffset;
      // editor height
      var eheight = actualY - top_offset;
      // Set wrapper height
      $('#smyles_editor_wrap').css('height', eheight);
      // Set dragbar opacity while dragging (set to 0 to not show)
      $('#smyles_dragbar').css('opacity', 0.15);
    });

  });

  $(document).mouseup(function (e) {

    if (window.dragging) {
      var smyles_editor = $('#query');

      var actualY = e.pageY - wpoffset;
      var top_offset = smyles_editor.offset().top - wpoffset;
      var eheight = actualY - top_offset;

      $(document).unbind('mousemove');

      // Set dragbar opacity back to 1
      $('#smyles_dragbar').css('opacity', 1);

      // Set height on actual editor element, and opacity back to 1
      smyles_editor.css('height', eheight).css('opacity', 1);

      // Trigger ace editor resize()
      editor.resize();
      window.dragging = false;
    }

  });

  $('#query-result,#content-query-result').on('dblclick', function(e) {
    var targ = e.target;
    for (var k in targ) {
      if (k.indexOf('__AG_') == 0) {
        drawCopyEl(targ, targ[k].cellComp.value);
      }
    }
  })

  if (external_where) {
    prevent_table_restore = true;
  }

  reloadDatabases();

  if (external_where) {
    var filter_q = 'SELECT * FROM ' + current_database + '.' + current_table + ' WHERE ' + external_where + ' LIMIT 1000';
    document.getElementById('content-loading').style.visibility = '';
    query('content', filter_q, function(data) {
      drawResponse(data, true);
      document.getElementById('content-loading').style.visibility = 'hidden';
      setContentParams(filter_q);
      $('#content-params').show();
    });
  } else {
    var section = localGetKey('default_section');
    if (section) {
      selectSection(section);
    }
  }
}

function setContentParams(query) {
  $('#content-params').attr('value', query);
}

function addFilter(el) {
  var par = el.parentNode;
  var clon = $(par).clone();
  clon.find('[data-btn="delete"]').attr('disabled', false);
  clon.appendTo(par.parentNode);
}

function delFilter(el) {
  var par = el.parentNode;
  par.parentNode.removeChild(par);
}

function parseHash() {
  var hash = window.location.hash;
  if (hash.charAt(0) == '#') {
    hash = hash.substring(1);
  }
  var hash_parts = hash.split(/\#/g, 4);
  db_host = hash_parts[0];
  if (hash_parts.length == 4) {
    current_database = hash_parts[1];
    current_table = hash_parts[2];
    var external_where = decodeURIComponent(hash_parts[3]);
  }

  return external_where;
}

function registerAltKeys() {
  $(document.body).on('keydown', function(e) {
    if (e.altKey) {
      switch (e.keyCode) {
        case 49: // 1
          selectSection('structure');
          break;
        case 50: // 2
          selectSection('content');
          break;
        case 51: // 3
          selectSection('query');
          break;
        default:
          return;
      }

      e.preventDefault();
    }
  });
}

function localGetKey(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.log(e);
  }

  return '';
}

function localSetKey(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.log(e);
  }
}

function submitQuery() {
  $('#content-params').hide();
  document.getElementById('executing').style.visibility = '';

  var q = editor.getValue();
  localSetKey('last_query', q);
  query('user', editor.getSelectedText() || q, function(data) {
    document.getElementById('executing').style.visibility = 'hidden';
    drawResponse(data);
  });
}

function selectSection(name) {
  $('.nav-pills li').removeClass('active');
  $('#section-' + name).addClass('active');
  $('#content-query-view,#query-view,#structure-view').hide();

  switch (name) {
    case 'content':
      $('#content-query-view').show();
      if (content_grid_options) {
        content_grid_options.api.doLayout();
      }
      break;
    case 'query':
      $('#query-view').show();
      if (grid_options) {
        grid_options.api.doLayout();
      }
      break;
    case 'structure':
      $('#structure-view').show();
      break;
  }

  localSetKey('default_section', name);
  return false;
}

function saveLastQuery() {
  try {
    localSetKey('last_query', editor.getValue());
  } catch (e) {}
}

function drawResponse(data, is_content, save_filters) {
  var id_prefix = '#' + (is_content ? 'content-' : '');

  document.querySelector(id_prefix + 'query-result').innerHTML = '';

  $(id_prefix + 'params').hide();
  $(id_prefix + 'query-ms').html(Math.floor((data['time_ns'] || 0) / 1000000))
  $(id_prefix + 'affected-rows').html(humanRowsCount(data['affected_rows'] || 0))
  $(id_prefix + 'result-rows').html(data.rows && data.rows.length)

  var grid_key = is_content ? 'content_grid' : 'grid';
  var grid_options_key = grid_key + '_options';

  if (window[grid_key]) {
    try {
      window[grid_key].destroy();
    } catch (e) {}
    window[grid_key] = null;
  }

  if (data.all_ok) {
    $(id_prefix + 'query-result').html('Query executed successfully');
    return;
  } else if (data.err) {
    $(id_prefix + 'query-result').html('<b>Error:</b> ' + data.err);
    return;
  }

  if (is_content) {
    resp_field_types = data.types;
  }

  var fields = data.fields;
  var rows = data.rows;

  var fullRows = [];
  var fullFields = [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var rowAssoc = {};
    for (var j = 0; j < row.length; j++) {
      rowAssoc[fields[j]] = row[j];
    }
    fullRows.push(rowAssoc);
  }

  if (is_content) {
    field_types = {};
  }
  for (var i = 0; i < fields.length; i++) {
    var f = {
      headerName: fields[i],
      field: fields[i],
      maxWidth: window.innerWidth - 300,
    };

    var field = fields[i];
    var typ = data.types ? (data.types[field] || '') : '';;
    if (is_content) {
      field_types[field] = typ;
    }

    if (typ.indexOf('Date') >= 0) {
      f.filterParams = {
        comparator: function (filterDate, value) {
          // either "yyyy-mm-dd hh:ii:ss" or "yyyy-mm-dd"
          var parts = value.split(" ")
          var dt = parts[0].split('-')
          if (parts.length == 1) {
            var cellDate = new Date(dt[0], dt[1] - 1, dt[2]);
          } else {
            var ts = parts[1].split(':')
            var cellDate = new Date(dt[0], dt[1] - 1, dt[2], ts[0], ts[1], ts[2]);
          }
          if (cellDate < filterDate) {
              return -1;
          } else if (cellDate > filterDate) {
              return 1;
          } else {
              return 0;
          }
        }
      }
    }

    fullFields.push(f)
  }

  if (is_content && !save_filters) {
    setUpFilters(fields);
  }

  window[grid_options_key] = {
    columnDefs: fullFields,
    rowData: fullRows,
    enableColResize: true,
    enableSorting: true,
    singleClickEdit: true,
    suppressFieldDotNotation: true
  };
  var query_res_el = document.querySelector(id_prefix + 'query-result')
  window[grid_key] = new agGrid.Grid(query_res_el, window[grid_options_key]);
}

var field_types = {};

function changeFilterType(el) {
  var $par = $(el.parentNode);
  var typ = field_types[el.value];
  if (!typ) {
    return;
  }

  var attr_type = 'text';

  if (typ.indexOf('Int') >= 0) {
    attr_type = 'number';
  } else if (typ.indexOf('Date') >= 0) {
    attr_type = 'date';
  }

  $par.find('.filter_value').attr('type', attr_type);
}

function setUpFilters(fields) {
  var inner = ['<div class="filter">\
  <select name="field" class="content-field select-mini" onchange="changeFilterType(this)"><option value="">Select field...</option>'];

  for (var i = 0; i < fields.length; i++) {
    inner.push('<option name="' + htmlspecialchars(fields[i]) + '">' + htmlspecialchars(fields[i]) + '</option>');
  }

  inner.push('</select>\
  <select name="operator" class="content-operator select-mini">\
    <option value="=">=</option>\
    <option value="&lt;&gt;">&lt;&gt;</option>\
    <option value="&gt;">&gt;</option>\
    <option value="&gt;=">&gt;=</option>\
    <option value="&lt;">&lt;</option>\
    <option value="&lt;=">&lt;=</option>\
    <option value="LIKE">LIKE</option>\
    <option value="NOT LIKE">NOT LIKE</option>\
  </select>\
  <input type="text" class="input-mini filter_value" style="width: 200px;" value="" onkeydown="if (event.keyCode == 13) { applyFilters(true); return false; }" />\
  <button class="btn btn-circle btn-mini pull-right" style="margin-left: 5px;" onclick="delFilter(this)" data-btn="delete" disabled><b>&ndash;</b></button>\
  <button class="btn btn-circle btn-mini pull-right" style="margin-left: 5px;" onclick="addFilter(this)"><b>+</b></button>\
</div>');

  document.getElementById('content-filters').innerHTML = inner.join('');
}

function getFiltersWhere() {
  var elements = document.getElementById('content-filters').getElementsByClassName('filter');
  var filters = ['1=1'];

  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    var field = el.getElementsByClassName('content-field')[0].value;
    var typ = field_types[field];
    var op = el.getElementsByClassName('content-operator')[0].value;
    var value = el.getElementsByClassName('filter_value')[0].value;
    if (!field) {
      continue;
    }

    if (typ.indexOf('Int') >= 0) {
      filters.push(field + ' ' + op + ' ' + parseInt(value));
    } else {
      filters.push(field + ' ' + op + " '" + mysql_real_escape_string(value) + "'");
    }
  }
  return filters;
}

function applyFilters(with_sort) {
  var where = getFiltersWhere();
  var where_part = where.join(' AND ');
  var sort_model = content_grid_options.api.getSortModel();
  if (with_sort) {
    var sort_parts = [];
    for (var i = 0; i < sort_model.length; i++) {
      var s = sort_model[i];
      sort_parts.push(s.colId + ' ' + s.sort.toUpperCase());
    }
    if (sort_parts.length > 0) {
      where_part += ' ORDER BY ' + sort_parts.join(', ');
    }
  }

  window.location.hash = db_host + '#' + current_database + '#' + current_table + '#' + encodeURIComponent(where_part);
  var q = 'SELECT * FROM ' + current_database + '.' + current_table +
    ' WHERE ' + where_part +
    ' LIMIT 1000';

  document.getElementById('content-loading').style.visibility = '';
  setContentParams(q);
  $('#content-params').show();

  query('content', q, function(data) {
    drawResponse(data, true, true);

    $('#content-params').show();
    content_grid_options.api.setSortModel(sort_model);
    document.getElementById('content-loading').style.visibility = 'hidden';
  });
}

// https://stackoverflow.com/questions/7744912/making-a-javascript-string-sql-friendly
function mysql_real_escape_string (str) {
  if (typeof str != 'string')
      return str;

  return str.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, function (char) {
      switch (char) {
          case "\0":
              return "\\0";
          case "\x08":
              return "\\b";
          case "\x09":
              return "\\t";
          case "\x1a":
              return "\\z";
          case "\n":
              return "\\n";
          case "\r":
              return "\\r";
          case "\"":
          case "'":
          case "\\":
          case "%":
              return "\\"+char; // prepends a backslash to backslash, percent,
                                // and double/single quotes
      }
  });
}

function query(key, str, callback) {
  var old = pending[key];
  if (old) {
    try {
      old.aborted = true;
    } catch(e) {}

    try {
      old.abort();
    } catch (e) {
      console.log(e);
    }
  }

  var xhr = new XMLHttpRequest();
  pending[key] = xhr;

  var params = "add_http_cors_header=1&log_queries=1&output_format_json_quote_64bit_integers=1" + (current_database ? '&database=' + current_database : '') + "&result_overflow_mode=throw"

  if (!window.i_am_mature_developer_and_i_am_responsible_for_my_own_mistakes) {
    params += "&readonly=1"
  }

  if (host_password && !basic_user) {
    params += "&password=" + encodeURIComponent(host_password);
  }

  var isCreate = (str.indexOf('create table') >= 0 || str.indexOf('CREATE TABLE') >= 0) && str.indexOf('SHOW CREATE TABLE') < 0;
  var isDrop = str.indexOf('DROP TABLE') >= 0 || str.indexOf('drop table') >= 0;
  var isInsert = str.indexOf('INSERT INTO') >= 0 || str.indexOf('insert into') >= 0;
  var isSelect = str.indexOf('SELECT') >= 0 || str.indexOf('select') >= 0;

  var uri = db_host + (db_host.indexOf('/?') >= 0 ? '&' : "/?") + params;

  if (basic_user) {
    xhr.open("POST", uri.replace(/basic_user\=([^&]+)/g, ''), true, basic_user, host_password)
    xhr.withCredentials = true
  } else {
    // password is appended to URL
    xhr.open("POST", uri, true)
  }

  xhr.onreadystatechange = function() {
    if (xhr.readyState === XMLHttpRequest.DONE) {
        if (xhr.status === 200) {
          var res;
          if (xhr.responseText == '') {
            res = {data: {all_ok: true}};
          } else {
            try {
              res = JSON.parse(xhr.responseText);
            } catch (e) {
              res = {data: {err: e}};
            }
          }

          var fields = [];
          var types = {};
          var statistics = res.statistics || {};

          if (res.meta) {
            for (var i = 0; i < res.meta.length; i++) {
              var m = res.meta[i];
              types[m.name] = m.type;
              fields.push(m.name);
            }
          }

          callback({
            fields: fields,
            rows: res.data,
            types: types,
            time_ns: statistics.elapsed * 1e9,
            affected_rows: statistics.rows_read,
          });

          if (isCreate || isDrop) {
            setTimeout(function() {
              selectDatabase(current_database, false);
            }, 0);
          } else if (isInsert) {

          }
        } else if (!xhr.aborted) {
          callback({err: 'got status ' + xhr.status + ', error text: ' + xhr.responseText})
        }
    }
  }
  xhr.onerror = function() {
    if (!xhr.aborted) {
      callback({err: 'XMLHttpRequest error: got status ' + xhr.status + ', error text: ' + xhr.responseText})
    }
  }

  str = str.replace(/\;\s*$/, '');

  if (isSelect && str.indexOf('limit') < 0 && str.indexOf('LIMIT') < 0) {
    str += "\nLIMIT 1000";
  }

  if (isSelect && !isInsert || !isCreate && !isDrop && !isInsert) {
    str += "\nFORMAT JSONCompact";
  }

  xhr.send(str);
}

function drawCopyEl(el, value) {
  var width = el.style.width;
  var off = $(el).offset();
  if (off.left + parseInt(width) > window.innerWidth) {
    off.left = window.innerWidth - parseInt(width);
  }
  if (off.left <= 0) {
    off.left = 0;
  }
  if (parseInt(width) >= window.innerWidth + 30) {
    width = (window.innerWidth - 30) + 'px';
  }
  var el = document.createElement('textarea');
  el.style.position = 'absolute';
  el.style.top = off.top + 'px';
  el.style.left = off.left + 'px';
  el.style.width = width;
  el.style.zIndex = '10000';
  document.body.appendChild(el);
  el.focus();
  el.value = value;
  $(el).height(0);
  var height = Math.max(20, Math.min(el.scrollHeight, 70));
  $(el).height(height);

  el.onblur = function() {
    document.body.removeChild(el);
  }

  el.onkeydown = function(e) {
    if (e.keyCode == 27 /* Esc */) {
      document.body.removeChild(el);
    }
  }
}

function selectDatabase(val, first) {
  current_database = val;
  localSetKey('current_database', current_database);
  query('tables', "SHOW TABLES FROM " + current_database, function(data) {
    if (data.err) {
      alert(data.err);
      return;
    }

    global_tables = [];
    for (var i = 0; i < data.rows.length; i++) global_tables[i] = data.rows[i][0];
    drawTables(global_tables, first);

    $('#info').html('');
    $('#search').val('');
  });
}

function reloadDatabases() {
  query('databases', "SHOW DATABASES", function(data) {
    if (data.err) {
      alert(data.err);
      return;
    }

    var default_database = "default";
    if (current_database) {
      default_database = current_database;
    } else {
      var saved_database = localGetKey("current_database");
      if (saved_database) {
        default_database = saved_database;
      }
    }

    var lst = ['<option value="">Select database...</option>'];
    for (var i = 0; i < data.rows.length; i++) {
      var name = data.rows[i][0];
      lst.push('<option value="' + htmlspecialchars(name) + '"' + (name == default_database ? ' selected="selected"' : '') + '>' + htmlspecialchars(name) + '</option>');
    }

    $('#database').html(lst.join("\n"));
    selectDatabase(default_database, true);
  });
}

function filterTables() {
  var q = $('#search').val();
  var tables = []
  if (q == '') {
    tables = global_tables;
  } else {
    for (var i = 0; i < global_tables.length; i++) {
      if (global_tables[i].indexOf(q) != -1) tables.push(global_tables[i]);
    }
  }
  drawTables(tables);
}

function drawTables(tables, first) {
  var result = ['<ul class="nav nav-list"><li class="nav-header">Tables</li>'];
  for (var i = 0; i < tables.length; i++) {
    var name = htmlspecialchars(tables[i]);
    result.push('<li><a href="#" class="table_name" data-name="' + name + '" title="' + name + '"><i class="icon-th"></i>' + name + '</a></li>')
  }
  result.push('</ul>');
  $('#tables').html(result.join("\n")).find('.table_name').bind('click', function() {
    var name = $(this).data('name');
    current_table = name;
    localSetKey('current_table', current_table);
    window.location.hash = db_host; // reset filters from history if any
    var className = 'active';
    $('#tables').find('.' + className).removeClass(className);
    $(this.parentNode).addClass(className);

    var q = 'SELECT * FROM ' + current_database + "." + name + ' LIMIT 100';

    document.getElementById('content-loading').style.visibility = '';
    query('content', q, function(data) {
      drawResponse(data, true);
      document.getElementById('content-loading').style.visibility = 'hidden';
    });

    query('structure', 'SHOW CREATE TABLE ' + current_database + '.' + current_table, function(data) {
      if (data.err) {
        console.log(data.err);
        return;
      }

      if (!data.rows || !data.rows[0] || !data.rows[0][0]) {
        console.log('not enough data', data);
        return;
      }

      var str = data.rows[0][0];
      str = str.replace(/(CREATE.*?)\((.*?)\)\s*(ENGINE|AS)/, function(data, cr, p1, p2) {
        return cr + "(\n " + p1.replace(/\,/g, ",\n").replace(/\((.*?),\n(.*?)\)/g, function(dt, pp1, pp2) {
          // Format things like 'AggregateFunction(sum, Int64)' properly
          return '(' + pp1 + ',' + pp2 + ')';
        }) + "\n) " + (p2 === 'ENGINE' ? "\n" : '') + p2;
      }).replace(/ (SELECT|FROM|WHERE|ORDER BY|GROUP BY|PARTITION BY|SETTINGS) /g, function(data, op) {
        return "\n" + op + " ";
      })

      $('#structure').html(htmlspecialchars(str));
    })

    query('table-info', "SELECT\
    any(engine), sum(rows), sum(bytes)  \
    FROM system.parts WHERE database = '" + current_database + "' AND table = '" + name + "'", function(data) {
      if (data.err) {
        console.log(data.err);
        return;
      }

      if (!data.rows || !data.rows[0]) {
        $('#info').html('');
        return;
      }

      var row = data.rows[0];

      $('#info').html(
        '<div><b>Engine:</b> ' + htmlspecialchars(row[0]) + '</div>' +
        '<div><b>Est. Rows:</b> ' + htmlspecialchars(humanRowsCount(row[1])) + '</div>' +
        '<div><b>Size:</b> ' + humanSize(row[2]) + '</div>' +
        '<div>&nbsp;</div>'
      );
    });
    return false;
  });

  if (first && !prevent_table_restore) {
    selectDefaultTable();
  }
}

function selectDefaultTable() {
  var default_table = localGetKey('current_table');
  if (!default_table) return;
  $('#tables').find('.table_name[data-name="' + default_table + '"]').trigger('click');
}

function humanSize(bytes) {
  if (bytes < 1024) return bytes + ' bytes';
  if (bytes < 1024*1024) return Math.floor(bytes / 1024) + ' Kb';
  if (bytes < 1024*1024*1024) return Math.floor(bytes / 1024 / 1024) + ' Mb';
  if (bytes < 1024*1024*1024*1024) return Math.floor(bytes / 1024 / 1024 / 1024) + ' Gb';
  return Math.floor(bytes / 1024 / 1024 / 1024 / 1024) + ' Tb';
}

function humanRowsCount(cnt) {
  var suffix = '';
  while (cnt > 1000) {
    cnt /= 1000;
    suffix += 'k';
  }
  return Math.round(cnt * 10) / 10 + suffix;
}

function string_utf8_len(str) {
  var len = 0, l = str.length;

  for (var i = 0; i < l; i++) {
    var c = str.charCodeAt(i);
    if (c <= 0x0000007F) len++;
    else if (c >= 0x00000080 && c <= 0x000007FF) len += 2;
    else if (c >= 0x00000800 && c <= 0x0000FFFF) len += 3;
    else len += 4;
  }

  return len;
}

function indent(str) {
  str = '' + str
  while (str.length < 8) str += ' '
  return str
}

function htmlspecialchars (string, quote_style, charset, double_encode) {
  // http://kevin.vanzonneveld.net
  // +   original by: Mirek Slugen
  // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // +   bugfixed by: Nathan
  // +   bugfixed by: Arno
  // +    revised by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // +    bugfixed by: Brett Zamir (http://brett-zamir.me)
  // +      input by: Ratheous
  // +      input by: Mailfaker (http://www.weedem.fr/)
  // +      reimplemented by: Brett Zamir (http://brett-zamir.me)
  // +      input by: felix
  // +    bugfixed by: Brett Zamir (http://brett-zamir.me)
  // %        note 1: charset argument not supported
  // *     example 1: htmlspecialchars("<a href='test'>Test</a>", 'ENT_QUOTES');
  // *     returns 1: '&lt;a href=&#039;test&#039;&gt;Test&lt;/a&gt;'
  // *     example 2: htmlspecialchars("ab\"c'd", ['ENT_NOQUOTES', 'ENT_QUOTES']);
  // *     returns 2: 'ab"c&#039;d'
  // *     example 3: htmlspecialchars("my "&entity;" is still here", null, null, false);
  // *     returns 3: 'my &quot;&entity;&quot; is still here'
  var optTemp = 0,
    i = 0,
    noquotes = false;
  if (typeof quote_style === 'undefined' || quote_style === null) {
    quote_style = 2;
  }
  string = string !== undefined ? string.toString() : 'undefined';
  if (double_encode !== false) { // Put this first to avoid double-encoding
    string = string.replace(/&/g, '&amp;');
  }
  string = string.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  var OPTS = {
    'ENT_NOQUOTES': 0,
    'ENT_HTML_QUOTE_SINGLE': 1,
    'ENT_HTML_QUOTE_DOUBLE': 2,
    'ENT_COMPAT': 2,
    'ENT_QUOTES': 3,
    'ENT_IGNORE': 4
  };
  if (quote_style === 0) {
    noquotes = true;
  }
  if (typeof quote_style !== 'number') { // Allow for a single string or an array of string flags
    quote_style = [].concat(quote_style);
    for (i = 0; i < quote_style.length; i++) {
      // Resolve string input to bitwise e.g. 'ENT_IGNORE' becomes 4
      if (OPTS[quote_style[i]] === 0) {
        noquotes = true;
      }
      else if (OPTS[quote_style[i]]) {
        optTemp = optTemp | OPTS[quote_style[i]];
      }
    }
    quote_style = optTemp;
  }
  if (quote_style & OPTS.ENT_HTML_QUOTE_SINGLE) {
    string = string.replace(/'/g, '&#039;');
  }
  if (!noquotes) {
    string = string.replace(/"/g, '&quot;');
  }

  return string;
}
