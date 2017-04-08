var Unsee = (function(params) {


    var timer = false;
    var version = false;
    var refreshInterval = 15;

    var selectors = {
        refreshButton: '#refresh',
        errors: '#errors'
    }


    init = function() {
        Progress.Init();

        Config.Init({
            CopySelector: '#copy-settings-with-filter',
            SaveSelector: '#save-default-filter',
            ResetSelector: '#reset-settings'
        });
        Config.Load();

        Counter.Init();
        Summary.Init();
        Grid.Init();
        Autocomplete.Init();
        Filters.Init();
        Watchdog.Init(30, 60*15); // set watchdog to 15 minutes

        $(selectors.refreshButton).click(function() {
            if (!$(selectors.refreshButton).prop('disabled')) {
                Unsee.Reload();
            }
            return false;
        });
    }


    getRefreshRate = function() {
        return refreshInterval;
    }


    setRefreshRate = function(seconds) {
        var rate = parseInt(seconds);
        if (isNaN(rate)) {
            // if passed rate is incorrect use select value
            rate = Config.GetOption('refresh').Get();
            if (isNaN(rate)) {
                // if that's also borked use default 15
                rate = 15;
            }
        }
        refreshInterval = rate;
        Progress.Reset();
    }


    needsUpgrade = function(responseVersion) {
        if (version == false) {
            version = responseVersion;
            return false;
        }
        return version != responseVersion;
    }


    renderError = function(template, context) {
        Counter.Error()
        Grid.Clear();
        Grid.Hide();
        $(selectors.errors).html(Templates.Render(template, context));
        $(selectors.errors).show();
        Counter.Unknown();
        Summary.Update({});
        document.title = "(◕ O ◕)";
        updateCompleted();
    }


    handleError = function(err) {
        Raven.captureException(err);
        if (window.console) {
            console.error(err.stack);
        }
        renderError('internalError', {
            name: err.name,
            message: err.message,
            raw: err
        });
        setTimeout(function() {
            Unsee.WaitForNextReload();
        }, 500);
    }


    upgrade = function() {
        renderError('reloadNeeded', {});
        setTimeout(function() {
            location.reload();
        }, 3000);
    }


    triggerReload = function() {
        updateIsReady();
        $.ajax({
            url: 'alerts.json?q=' + Filters.GetFilters().join(','),
            success: function(resp) {
                Counter.Success();
                if (needsUpgrade(resp['version'])) {
                    upgrade();
                } else if (resp['error']) {
                    Counter.Unknown();
                    renderError('updateError', {
                        error: 'Backend error',
                        message: resp['error'],
                        last_ts: Watchdog.GetLastUpdate()
                    });
                    Unsee.WaitForNextReload();
                } else {
                    // update_alerts() is cpu heavy so it will block browser from applying css changes
                    // inject tiny delay between addClass() above and update_alerts() so that the browser
                    // have a chance to reflect those updates
                    setTimeout(function() {
                        try {
                            Summary.Update({});
                            Filters.ReloadBadges(resp['filters']);
                            Colors.Update(resp['colors']);
                            Alerts.Update(resp);
                            updateCompleted();
                            Watchdog.Pong(moment(resp['timestamp']));
                            Unsee.WaitForNextReload();
                            if (!Watchdog.IsFatal()) {
                              $(selectors.errors).html('');
                              $(selectors.errors).hide('');
                            }
                        } catch (err) {
                            Counter.Unknown();
                            handleError(err);
                            Unsee.WaitForNextReload();
                        }
                    }, 50);
                }
            },
            error: function(jqXHR, textStatus) {
                Counter.Unknown();
                // if fatal error was already triggered we have error message
                // so don't add new one
                if (!Watchdog.IsFatal()) {
                    renderError('updateError', {
                        error: 'Backend error',
                        message: 'AJAX request failed',
                        last_ts: Watchdog.GetLastUpdate()
                    })
                }
                Unsee.WaitForNextReload();
            }
        })
    }


    updateIsReady = function() {
        Progress.Complete();
        $(selectors.refreshButton).prop('disabled', true);
        Counter.Hide();
    }


    updateCompleted = function() {
        Counter.Show();
        Filters.UpdateCompleted();
        Progress.Complete();
        $(selectors.refreshButton).prop('disabled', false);
        // hack for fixing padding since input can grow and change height
        $('body').css('padding-top', $('.navbar').height());
    }


    pause = function() {
        Progress.Pause();
        Filters.Pause();
        if (timer != false) {
            clearInterval(timer);
            timer = false;
        }
    }


    resume = function() {
        if (Config.GetOption('autorefresh').Get()) {
            Filters.UpdateCompleted();
        } else {
            Filters.Pause();
            return false;
        }
        Progress.Reset();
        if (timer != false) {
            clearInterval(timer);
        }
        timer = setTimeout(Unsee.Reload, Unsee.GetRefreshRate() * 1000);
    }


    flash = function() {
        var bg = $('#flash').css('background-color');
        $('#flash').css('display', 'block').animate({
            backgroundColor: '#fff'
        }, 300, function() {
            $(this).animate({
                backgroundColor: bg
            }, 100).css('display', 'none');
        });
    }


    return {
        Init: init,
        Pause: pause,
        WaitForNextReload: resume,
        Reload: triggerReload,
        GetRefreshRate: getRefreshRate,
        SetRefreshRate: setRefreshRate,
        Flash: flash
    }

})();


$(document).ready(function() {

    // init all elements using bootstrapSwitch
    $('.toggle').bootstrapSwitch();

    // enable tooltips, #settings is a dropdown so it already uses different data-toggle
    $('[data-toggle="tooltip"], #settings').tooltip({
        trigger: 'hover'
    });

    Templates.Init();
    UI.Init();
    Unsee.Init();

    // delay initial alert load to allow browser finish rendering
    setTimeout(function() {
        Filters.SetFilters();
    }, 100);

});
