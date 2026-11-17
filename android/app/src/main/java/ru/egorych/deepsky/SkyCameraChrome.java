package ru.egorych.deepsky;

import android.app.Dialog;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.view.Gravity;
import android.view.RoundedCorner;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.appcompat.widget.SwitchCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import java.util.function.Consumer;

final class SkyCameraChrome {
    final LinearLayout top, bottom;
    private final SkyCameraActivity activity;
    private final int accent, text, muted, glass, sheetColor, border, scrim;
    private final TextView status, contextTitle, contextDetail, alignLabel;
    private final View statusDot;
    private final LinearLayout exposure;
    private final TextView exposureLabel;
    private final ImageView alignIcon;
    private final LinearLayout contextCard, align, layers;
    private final ImageButton clear;

    SkyCameraChrome(SkyCameraActivity activity, FrameLayout root, boolean redMode, int accent,
                    Runnable back, Runnable info, Runnable showLayers, Runnable calibrate, Runnable clearAction) {
        this.activity = activity;
        this.accent = accent;
        text = redMode ? 0xffe8b9ae : 0xffedf2f8;
        muted = redMode ? 0xffbc8f85 : 0xffa8b8cb;
        glass = redMode ? 0xe9231514 : 0xe9151e2a;
        sheetColor = redMode ? 0xff211513 : 0xff111a25;
        border = redMode ? 0xff53342e : 0xff344457;
        scrim = redMode ? 0xe8190b09 : 0xe8091019;

        top = column();
        top.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{scrim, Color.TRANSPARENT}));
        var header = row();
        header.addView(iconButton(R.drawable.ic_camera_back, "Вернуться на карту", back), square(46));
        var heading = column();
        heading.setGravity(Gravity.CENTER_HORIZONTAL);
        TextView title = label("Небо в камере", 18, text, true);
        title.setGravity(Gravity.CENTER);
        heading.addView(title);
        var badge = row();
        badge.setGravity(Gravity.CENTER);
        badge.setPadding(dp(8), dp(3), dp(8), dp(3));
        badge.setBackground(shape(glass, 12, 0));
        statusDot = new View(activity);
        badge.addView(statusDot, new LinearLayout.LayoutParams(dp(5), dp(5)));
        status = label("Запуск камеры", 11, muted, false);
        status.setGravity(Gravity.CENTER);
        status.setMaxLines(2);
        var statusParams = new LinearLayout.LayoutParams(-2, -2);
        statusParams.leftMargin = dp(5);
        badge.addView(status, statusParams);
        var badgeParams = new LinearLayout.LayoutParams(-2, -2);
        badgeParams.topMargin = dp(4);
        heading.addView(badge, badgeParams);
        header.addView(heading, new LinearLayout.LayoutParams(0, -2, 1));
        exposure = pill(R.drawable.ic_camera_exposure, "Ночь", "Режим камеры", info);
        exposureLabel = (TextView) exposure.getChildAt(1);
        exposureLabel.setTextSize(12);
        exposure.setMinimumWidth(dp(72));
        exposure.setPadding(dp(10), 0, dp(10), 0);
        header.addView(exposure, new LinearLayout.LayoutParams(-2, dp(46)));
        top.addView(header, new LinearLayout.LayoutParams(-1, -2));
        root.addView(top, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        bottom = column();
        bottom.setGravity(Gravity.CENTER_HORIZONTAL);
        bottom.setBackground(new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, new int[]{scrim, Color.TRANSPARENT}));
        contextCard = row();
        contextCard.setBackground(shape(glass, 18, border));
        contextCard.setPadding(dp(13), dp(9), dp(5), dp(9));
        var contextCopy = column();
        contextTitle = label("", 16, text, true);
        contextDetail = label("", 12, muted, false);
        contextDetail.setPadding(0, dp(3), 0, 0);
        contextCopy.addView(contextTitle);
        contextCopy.addView(contextDetail);
        contextCard.addView(contextCopy, new LinearLayout.LayoutParams(0, -2, 1));
        clear = iconButton(R.drawable.ic_camera_close, "Снять цель", clearAction);
        contextCard.addView(clear, square(44));
        contextCard.setVisibility(View.GONE);
        var cardParams = new LinearLayout.LayoutParams(-1, -2);
        cardParams.bottomMargin = dp(8);
        bottom.addView(contextCard, cardParams);
        var dock = row();
        dock.setGravity(Gravity.CENTER);
        layers = pill(R.drawable.ic_camera_layers, "Слои", "Слои неба", showLayers);
        align = pill(R.drawable.ic_camera_align, "По звезде", "Уточнить по звезде", calibrate);
        alignIcon = (ImageView) align.getChildAt(0);
        alignLabel = (TextView) align.getChildAt(1);
        var layersParams = new LinearLayout.LayoutParams(-2, dp(48));
        layersParams.rightMargin = dp(8);
        dock.addView(layers, layersParams);
        dock.addView(align, new LinearLayout.LayoutParams(-2, dp(48)));
        bottom.addView(dock);
        root.addView(bottom, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        status("Запуск камеры", "Открываем камеру", false);

        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            var safe = insets.getInsets(WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.systemBars());
            top.setPadding(safe.left + dp(16), safe.top + dp(10), safe.right + dp(16), dp(16));
            bottom.setPadding(safe.left + dp(16), dp(12), safe.right + dp(16), safe.bottom + dp(14));
            return insets;
        });
    }

    void status(String caption, String description, boolean tracking) {
        updateText(status, caption);
        if (!description.contentEquals(status.getContentDescription() == null ? "" : status.getContentDescription())) {
            status.setContentDescription(description);
        }
        int color = tracking ? accent : muted;
        if (!Integer.valueOf(color).equals(statusDot.getTag())) {
            statusDot.setBackground(shape(color, 5, 0));
            statusDot.setTag(color);
        }
    }

    void exposure(String mode) {
        exposureLabel.setText(mode);
        exposure.setContentDescription("Режим камеры: " + mode);
    }

    void guidance(String title, String detail, boolean calibrating, boolean fittingScale, boolean ready) {
        boolean visible = title != null;
        int visibility = visible ? View.VISIBLE : View.GONE;
        if (contextCard.getVisibility() != visibility) contextCard.setVisibility(visibility);
        if (visible) {
            updateText(contextTitle, title);
            updateText(contextDetail, detail);
            String clearDescription = calibrating || fittingScale ? "Отменить привязку" : "Снять цель";
            if (!clearDescription.contentEquals(clear.getContentDescription())) clear.setContentDescription(clearDescription);
        }
        align.setVisibility(fittingScale ? View.GONE : View.VISIBLE);
        if (align.isEnabled() != ready) {
            align.setEnabled(ready);
            align.setAlpha(ready ? 1 : .5f);
        }
        String command = calibrating ? "Звезда в центре" : "По звезде";
        if (!command.contentEquals(alignLabel.getText())) {
            alignLabel.setText(command);
            align.setContentDescription(calibrating ? command : "Уточнить по звезде");
            alignIcon.setImageResource(calibrating ? R.drawable.ic_camera_check : R.drawable.ic_camera_align);
        }
    }

    private static void updateText(TextView view, String value) {
        if (!value.contentEquals(view.getText())) view.setText(value);
    }

    final class Sheet {
        private final Dialog dialog;
        private final LinearLayout body;

        Sheet(String title, String detail) {
            dialog = new Dialog(activity);
            var panel = column();
            panel.setPadding(dp(18), dp(9), dp(18), dp(16));
            panel.setBackground(shape(sheetColor, 24, border));
            var handle = new View(activity);
            handle.setBackground(shape(border, 3, 0));
            var handleParams = new LinearLayout.LayoutParams(dp(32), dp(3));
            handleParams.gravity = Gravity.CENTER_HORIZONTAL;
            handleParams.bottomMargin = dp(8);
            panel.addView(handle, handleParams);

            var header = row();
            var heading = column();
            TextView eyebrow = label("НЕБО В КАМЕРЕ", 10, accent, true);
            eyebrow.setLetterSpacing(.13f);
            heading.addView(eyebrow);
            var name = label(title, 23, text, true);
            name.setPadding(0, dp(2), 0, 0);
            heading.addView(name);
            header.addView(heading, new LinearLayout.LayoutParams(0, -2, 1));
            header.addView(iconButton(R.drawable.ic_camera_close, "Закрыть панель", dialog::dismiss), square(44));
            panel.addView(header);
            TextView description = label(detail, 13, muted, false);
            description.setPadding(0, dp(6), 0, dp(12));
            panel.addView(description);

            var scroll = new ScrollView(activity) {
                @Override protected void onMeasure(int width, int height) {
                    int limit = (int) (getResources().getDisplayMetrics().heightPixels * .54);
                    int available = MeasureSpec.getMode(height) == MeasureSpec.UNSPECIFIED
                        ? limit : Math.min(limit, MeasureSpec.getSize(height));
                    super.onMeasure(width, MeasureSpec.makeMeasureSpec(available, MeasureSpec.AT_MOST));
                }
            };
            scroll.setClipToPadding(false);
            body = column();
            scroll.addView(body, new ScrollView.LayoutParams(-1, -2));
            panel.addView(scroll, new LinearLayout.LayoutParams(-1, -2));
            // Keep the outline itself inside the safe area, not just the panel's text.
            var safeFrame = new FrameLayout(activity);
            safeFrame.setPadding(0, 0, 0, sheetBottomGap());
            safeFrame.addView(panel, new FrameLayout.LayoutParams(-1, -2));
            ViewCompat.setOnApplyWindowInsetsListener(safeFrame, (view, insets) -> {
                var safe = insets.getInsets(WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.navigationBars());
                view.setPadding(safe.left, 0, safe.right, Math.max(safe.bottom, sheetBottomGap()));
                return insets;
            });
            dialog.setContentView(safeFrame);
        }

        void toggle(String title, String hint, boolean enabled, Consumer<Boolean> change) {
            var item = listRow(title, hint);
            var toggle = new SwitchCompat(activity);
            toggle.setContentDescription(title);
            toggle.setChecked(enabled);
            toggle.setThumbTintList(checkedColors(accent, muted));
            toggle.setTrackTintList(checkedColors(0xff77694f, border));
            toggle.setOnCheckedChangeListener((button, value) -> change.accept(value));
            item.addView(toggle, square(48));
            item.setOnClickListener(view -> toggle.toggle());
        }

        void action(String title, String hint, Runnable action) {
            var item = listRow(title, hint);
            var arrow = new ImageView(activity);
            arrow.setImageResource(R.drawable.ic_camera_chevron);
            arrow.setColorFilter(accent);
            item.addView(arrow, square(20));
            item.setOnClickListener(view -> {
                dialog.dismiss();
                action.run();
            });
        }

        private LinearLayout listRow(String title, String hint) {
            var item = row();
            item.setMinimumHeight(dp(53));
            item.setPadding(dp(12), dp(7), dp(8), dp(7));
            item.setBackground(pressable(glass, 13, 0));
            var copy = column();
            copy.addView(label(title, 14, text, true));
            if (!hint.isEmpty()) copy.addView(label(hint, 12, muted, false));
            item.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));
            var params = new LinearLayout.LayoutParams(-1, -2);
            params.bottomMargin = dp(5);
            body.addView(item, params);
            return item;
        }

        void show() {
            var window = dialog.getWindow();
            if (window == null) return;
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            window.setGravity(Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE);
            window.setDimAmount(.25f);
            WindowCompat.setDecorFitsSystemWindows(window, false);
            dialog.show();
            int width = Math.min(dp(480), activity.getResources().getDisplayMetrics().widthPixels - dp(24));
            window.setLayout(width, -2);
            WindowCompat.getInsetsController(window, window.getDecorView()).hide(WindowInsetsCompat.Type.systemBars());
            window.clearFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE);
        }
    }

    private int sheetBottomGap() {
        int gap = dp(14);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            var insets = activity.getWindow().getDecorView().getRootWindowInsets();
            if (insets != null) {
                var left = insets.getRoundedCorner(RoundedCorner.POSITION_BOTTOM_LEFT);
                var right = insets.getRoundedCorner(RoundedCorner.POSITION_BOTTOM_RIGHT);
                int radius = Math.max(left == null ? 0 : left.getRadius(), right == null ? 0 : right.getRadius());
                // The panel already has rounded corners and a horizontal margin.
                gap = Math.max(gap, (radius + 1) / 2);
            }
        }
        return gap;
    }

    private LinearLayout pill(int icon, String title, String description, Runnable action) {
        var pill = row();
        pill.setGravity(Gravity.CENTER);
        pill.setMinimumWidth(dp(105));
        pill.setPadding(dp(15), 0, dp(15), 0);
        pill.setBackground(pressable(glass, 22, border));
        var image = new ImageView(activity);
        image.setImageResource(icon);
        image.setColorFilter(accent);
        pill.addView(image, square(19));
        var titleParams = new LinearLayout.LayoutParams(-2, -2);
        titleParams.leftMargin = dp(7);
        pill.addView(label(title, 14, text, true), titleParams);
        pill.setContentDescription(description);
        ViewCompat.setScreenReaderFocusable(pill, true);
        pill.setOnClickListener(view -> action.run());
        return pill;
    }

    private ImageButton iconButton(int icon, String description, Runnable action) {
        var button = new ImageButton(activity);
        button.setImageResource(icon);
        button.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        button.setPadding(dp(11), dp(11), dp(11), dp(11));
        button.setColorFilter(text);
        button.setContentDescription(description);
        button.setBackground(pressable(glass, 16, border));
        button.setOnClickListener(view -> action.run());
        return button;
    }

    private GradientDrawable shape(int fill, float radius, int stroke) {
        var drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(dp(radius));
        if (stroke != 0) drawable.setStroke(dp(1), stroke);
        return drawable;
    }

    private RippleDrawable pressable(int fill, float radius, int stroke) {
        return new RippleDrawable(ColorStateList.valueOf((accent & 0xffffff) | 0x30000000),
            shape(fill, radius, stroke), null);
    }

    private ColorStateList checkedColors(int checked, int unchecked) {
        return new ColorStateList(new int[][]{new int[]{android.R.attr.state_checked}, new int[0]},
            new int[]{checked, unchecked});
    }

    private LinearLayout row() {
        var row = new LinearLayout(activity);
        row.setGravity(Gravity.CENTER_VERTICAL);
        return row;
    }

    private LinearLayout column() {
        var column = new LinearLayout(activity);
        column.setOrientation(LinearLayout.VERTICAL);
        return column;
    }

    private TextView label(String title, int size, int color, boolean strong) {
        var label = new TextView(activity);
        label.setText(title);
        label.setTextSize(size);
        label.setTextColor(color);
        if (strong) label.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        return label;
    }

    private LinearLayout.LayoutParams square(float size) { return new LinearLayout.LayoutParams(dp(size), dp(size)); }
    private int dp(float value) { return Math.round(value * activity.getResources().getDisplayMetrics().density); }
}
