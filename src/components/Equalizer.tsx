import React, { useState, useEffect } from "react";
import { useAudio } from "../context/AudioContext";
import { themeStyles } from "../lib/theme";
import { EqProfile, DEFAULT_EQ_PRESETS } from "../lib/db";
import { Sliders, Save, Trash2, Plus, RefreshCw } from "lucide-react";

export const Equalizer: React.FC = () => {
  const {
    eqProfiles,
    activeEqProfile,
    applyEqProfile,
    saveCustomEqProfile,
    deleteEqProfile,
    theme,
  } = useAudio();

  const [sliderGains, setSliderGains] = useState<number[]>([...activeEqProfile.gains]);
  const [profileName, setProfileName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const frequencies = ["32Hz", "64Hz", "125Hz", "250Hz", "500Hz", "1kHz", "2kHz", "4kHz", "8kHz", "16kHz"];

  const activeStyles = themeStyles[theme] || themeStyles.red;

  // Sync sliders with the active EQ profile when it changes
  useEffect(() => {
    setSliderGains([...activeEqProfile.gains]);
  }, [activeEqProfile]);

  const handleSliderChange = (index: number, value: number) => {
    const newGains = [...sliderGains];
    newGains[index] = value;
    setSliderGains(newGains);

    // Create a temporary profile to apply on the fly
    const tempProfile: EqProfile = {
      id: "temp_custom",
      name: "Custom (Modified)",
      gains: newGains,
      isPreset: false,
    };
    applyEqProfile(tempProfile);
  };

  const resetToFlat = () => {
    const flat = DEFAULT_EQ_PRESETS[0];
    applyEqProfile(flat);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (!profileName.trim()) {
      setErrorMsg("Please enter a name for your profile");
      return;
    }

    try {
      const saved = await saveCustomEqProfile(profileName.trim(), [...sliderGains]);
      applyEqProfile(saved);
      setProfileName("");
      setIsSaving(false);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save profile");
    }
  };

  return (
    <div id="equalizer-container" className="bg-zinc-900/40 border border-zinc-900 rounded-3xl p-5 flex flex-col gap-4 text-slate-200 shadow-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className={`w-5 h-5 ${activeStyles.text}`} />
          <h3 className="font-bold text-slate-100 text-sm md:text-base">10-Band Equalizer</h3>
        </div>
        <div className="flex gap-2">
          <button
            id="eq-reset-btn"
            onClick={resetToFlat}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-800 text-slate-200 hover:text-white border border-zinc-700/40 rounded-xl transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset Flat
          </button>
          <button
            id="eq-save-trigger"
            onClick={() => setIsSaving(!isSaving)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs ${activeStyles.bg} text-white ${activeStyles.hoverBg} rounded-xl font-semibold transition cursor-pointer shadow-md`}
          >
            <Plus className="w-3.5 h-3.5" />
            Save Profile
          </button>
        </div>
      </div>

      {isSaving && (
        <form onSubmit={handleSaveProfile} className="bg-zinc-950 border border-zinc-900 rounded-2xl p-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-500">Custom Profile Name</label>
            <div className="flex gap-2">
              <input
                id="eq-profile-name-input"
                type="text"
                placeholder="My Bass EQ"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none placeholder-zinc-600 focus:border-zinc-700"
              />
              <button
                id="eq-profile-submit"
                type="submit"
                className={`flex items-center gap-1 ${activeStyles.bg} ${activeStyles.hoverBg} text-white px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer shadow-md`}
              >
                <Save className="w-3.5 h-3.5" />
                Save
              </button>
            </div>
            {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
          </div>
        </form>
      )}

      {/* Profile selector */}
      <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
        {eqProfiles.map((profile) => {
          const isActive = activeEqProfile.id === profile.id || 
            (profile.id === "temp_custom" && activeEqProfile.id === "temp_custom");
          return (
            <div
              key={profile.id}
              className={`flex items-center gap-1.5 p-1 px-3 rounded-full border text-xs transition ${
                isActive
                  ? `${activeStyles.pulseBg} ${activeStyles.pulseBorder} ${activeStyles.text} font-semibold`
                  : "bg-zinc-950 border-zinc-900 text-zinc-400 hover:text-zinc-200 hover:border-zinc-800"
              }`}
            >
              <button
                id={`eq-profile-select-${profile.id}`}
                onClick={() => applyEqProfile(profile)}
                className="font-semibold cursor-pointer py-1"
              >
                {profile.name}
              </button>
              {!profile.isPreset && (
                <button
                  id={`eq-profile-delete-${profile.id}`}
                  onClick={() => deleteEqProfile(profile.id)}
                  className="p-1 hover:text-red-400 transition cursor-pointer ml-1"
                  title="Delete EQ Profile"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Graphic EQ Sliders */}
      <div className="grid grid-cols-5 md:grid-cols-10 gap-2 bg-zinc-950 p-3 rounded-2xl border border-zinc-900/60">
        {frequencies.map((freq, i) => (
          <div key={freq} className="flex flex-col items-center gap-2">
            <span className="text-[9px] font-mono text-zinc-500">{freq}</span>
            <div className="relative h-24 md:h-32 flex items-center justify-center">
              <input
                id={`eq-slider-${freq}`}
                type="range"
                min="-12"
                max="12"
                step="0.5"
                value={sliderGains[i] ?? 0}
                onChange={(e) => handleSliderChange(i, parseFloat(e.target.value))}
                className={`${activeStyles.accent} cursor-pointer h-full`}
                style={{
                  writingMode: "vertical-lr",
                  direction: "rtl",
                  width: "20px",
                }}
              />
            </div>
            <span className="text-[9px] font-mono font-bold text-zinc-400">
              {sliderGains[i] > 0 ? `+${sliderGains[i]}` : sliderGains[i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
export default Equalizer;
