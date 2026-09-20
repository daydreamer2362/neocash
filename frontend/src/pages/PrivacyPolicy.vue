<template>
  <div class="page-no-tab">
    <div class="nav-bar">
      <button class="back-btn" @click="$router.back()">
        <img src="/icons/back.png" />
      </button>
      <span class="nav-title">User Privacy Agreement</span>
    </div>

    <div class="policy-wrap card">
      <h2 class="policy-title">Privacy Policy</h2>
      <p class="policy-intro">
        This is a placeholder privacy policy for NeoCash, provided so the app can be deployed
        while the final legal text is prepared. It will be replaced with the reviewed version
        before launch.
      </p>

      <ul class="policy-list">
        <li>
          <strong>Information we collect</strong>
          <ul>
            <li>Account details you provide, such as phone number, username, and email.</li>
            <li>Transaction and order data needed to process payments and payouts.</li>
            <li>Device and usage information collected automatically to keep the service secure.</li>
          </ul>
        </li>
        <li>
          <strong>How we use your information</strong>
          <ul>
            <li>To operate your account, process orders, and provide customer support.</li>
            <li>To detect and prevent fraud, abuse, and unauthorized access.</li>
            <li>To comply with applicable legal and regulatory obligations.</li>
          </ul>
        </li>
        <li>
          <strong>Sharing of information</strong>
          <ul>
            <li>We do not sell your personal data.</li>
            <li>Information may be shared with service providers strictly to operate the platform (e.g. payment processing, authentication).</li>
          </ul>
        </li>
        <li>
          <strong>Data security</strong>
          <ul>
            <li>We use industry-standard measures to protect your data, including encryption in transit.</li>
          </ul>
        </li>
        <li>
          <strong>Your rights</strong>
          <ul>
            <li>You may request access to, correction of, or deletion of your account data by contacting support.</li>
          </ul>
        </li>
        <li>
          <strong>Changes to this policy</strong>
          <ul>
            <li>We may update this policy from time to time. Continued use of the app after changes means you accept the updated terms.</li>
          </ul>
        </li>
      </ul>

      <p class="policy-title" style="margin-top: 16px; font-size: 14px;">
        By continuing to use the platform, you acknowledge that you have read, understood, and agreed to all terms stated above.
      </p>
    </div>
  </div>
</template>

<script>
export default {
  name: 'PrivacyPolicyPage'
}
</script>

<style scoped>
.policy-wrap {
  margin: 16px;
  line-height: 1.65;
}

.policy-title {
  font-size: 22px;
  font-weight: 800;
  margin-bottom: 10px;
}

.policy-intro {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.policy-list {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.policy-list li {
  font-size: 14px;
  color: var(--text-primary);
}

.policy-list strong {
  display: block;
}

.policy-list ul {
  margin-top: 6px;
  padding-left: 18px;
}
</style>
