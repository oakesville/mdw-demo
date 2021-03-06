package com.centurylink.mdw.sendgrid;

import java.io.IOException;
import java.util.List;

import com.centurylink.mdw.activity.ActivityException;
import com.centurylink.mdw.activity.types.NotificationActivity;
import com.centurylink.mdw.annotations.Activity;
import com.centurylink.mdw.cache.asset.AssetCache;
import com.centurylink.mdw.common.MdwException;
import com.centurylink.mdw.constant.WorkAttributeConstant;
import com.centurylink.mdw.dataaccess.DataAccessException;
import com.centurylink.mdw.model.asset.Asset;
import com.centurylink.mdw.model.asset.AssetVersionSpec;
import com.centurylink.mdw.model.workflow.ActivityRuntimeContext;
import com.centurylink.mdw.services.user.ContextEmailRecipients;
import com.centurylink.mdw.util.log.StandardLogger.LogLevel;
import com.centurylink.mdw.util.timer.Tracked;
import com.centurylink.mdw.workflow.activity.DefaultActivityImpl;

/**
 * Send email notices using the SendGrid API.
 * Requires a SendGrid account with a registered API key.
 */
@Tracked(LogLevel.TRACE)
@Activity(value="SendGrid Email", category=NotificationActivity.class, icon="com.centurylink.mdw.sendgrid/sendgrid.png",
        pagelet="com.centurylink.mdw.sendgrid/sendgridNotify.pagelet")
public class SendgridActivity extends DefaultActivityImpl {

    @Override
    public Object execute(ActivityRuntimeContext context) throws ActivityException {
        String templateName = getAttributeValueSmart(WorkAttributeConstant.NOTICE_TEMPLATE);
        if (templateName == null)
            throw new ActivityException("Missing attribute: " + WorkAttributeConstant.NOTICE_TEMPLATE);
        String templateVersion = getAttributeValue(WorkAttributeConstant.NOTICE_TEMPLATE + "_assetVersion");
        AssetVersionSpec spec = new AssetVersionSpec(templateName, templateVersion == null ? "0" : templateVersion);
        try {
            Asset template = AssetCache.getAsset(spec);
            if (template == null)
                throw new IOException("No template asset found: " + spec);
            send(template, context);
        }
        catch (MdwException | IOException ex) {
            logError(ex.getMessage(), ex);
            if (!"true".equalsIgnoreCase(getAttributeValueSmart(WorkAttributeConstant.CONTINUE_DESPITE_MESSAGING_EXCEPTION))) {
                throw new ActivityException(ex.getMessage(), ex);
            }
        }
        return null;
    }

    protected void send(Asset template, ActivityRuntimeContext context) throws MdwException, IOException {
        if ("html".equals(template.getExtension()) || "txt".equals(template.getExtension())) {
            String fromEmail = getAttributeValueSmart(WorkAttributeConstant.NOTICE_FROM);
            if (fromEmail == null)
                throw new ActivityException("Missing attribute: " + WorkAttributeConstant.NOTICE_FROM);
            String subject = getAttributeValueSmart(WorkAttributeConstant.NOTICE_SUBJECT);
            if (subject == null)
                throw new ActivityException("Missing attribute: " + WorkAttributeConstant.NOTICE_SUBJECT);

            try {
                ContextEmailRecipients contextRecipients = new ContextEmailRecipients(context);
                List<String> recipients = contextRecipients.getRecipients(WorkAttributeConstant.NOTICE_GROUPS,
                        WorkAttributeConstant.RECIPIENTS_EXPRESSION);
                List<String> ccRecipients = contextRecipients.getRecipients(WorkAttributeConstant.CC_GROUPS, null);
                if (recipients.isEmpty() && ccRecipients.isEmpty()) {
                    logWarn("Warning: no email recipients");
                }
                else {
                    Email email = new EmailBuilder(template, context)
                            .from(fromEmail)
                            .subject(subject)
                            .to(recipients.toArray(new String[0]))
                            .cc(ccRecipients.toArray(new String[0]))
                            .create();
                    new Sender(email).send();
                }
            }
            catch (DataAccessException ex) {
                throw new ActivityException(ex.getMessage(), ex);
            }
        }
        else if ("json".equals(template.getExtension())) {
            // Caller has built the message json themselves; simply apply substitutions.
            new Sender(context.evaluateToString(template.getText())).send();
        }
        else {
            throw new ActivityException("Unsupported template format: " + template);
        }
    }
}
